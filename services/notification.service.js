const { getMessagingInstance } = require('../config/firebase');
const notificationModel = require('../models/notification.model');
 
const buildFcmPayload = (tokens, { title, body, data = {}, imageUrl, clickAction = '/home' }) => {
    const stringifiedData = {};
    Object.entries(data || {}).forEach(([k, v]) => {
        stringifiedData[k] = typeof v === 'object' ? JSON.stringify(v) : String(v);
    });
    stringifiedData.click_action = clickAction;
    stringifiedData.timestamp = String(Date.now());
    stringifiedData.title = String(title);
    stringifiedData.body = String(body);

    return {
        tokens,
        notification: {
            title,
            body,
            ...(imageUrl ? { imageUrl } : {}),
        },
        data: stringifiedData,
        webpush: {
            notification: {
                title,
                body,
                icon: '/favicon.svg',
                badge: '/favicon.svg',
                ...(imageUrl ? { image: imageUrl } : {}),
                requireInteraction: false,
            },
            fcmOptions: {
                link: clickAction,
            },
        },
    };
};

 
const dispatchMulticast = async (messaging, fcmPayload, fcmTokens) => {
    const result = {
        pushSentCount: 0,
        pushFailedCount: 0,
        cleanedTokensCount: 0,
        fcmStatus: 'delivered',
    };

    try {
        const response = await messaging.sendEachForMulticast(fcmPayload);
        result.pushSentCount = response.successCount;
        result.pushFailedCount = response.failureCount;
        result.fcmStatus = response.failureCount === 0 ? 'delivered' : 'partial';

        // Auto-purge unregistered or invalid tokens
        if (response.failureCount > 0) {
            const staleTokens = [];
            response.responses.forEach((resp, idx) => {
                if (!resp.success && resp.error) {
                    const code = resp.error.code;
                    if (
                        code === 'messaging/invalid-registration-token' ||
                        code === 'messaging/registration-token-not-registered' ||
                        code === 'messaging/mismatched-credential'
                    ) {
                        staleTokens.push(fcmTokens[idx]);
                    }
                }
            });

            if (staleTokens.length > 0) {
                const cleaned = await notificationModel.removeInvalidTokens(staleTokens);
                result.cleanedTokensCount = cleaned;
                console.log(`[Notification] Cleaned ${cleaned} stale/expired FCM token(s).`);
            }
        }
    } catch (fcmErr) {
        console.error('[Notification] Error dispatching FCM multicast message:', fcmErr.message);
        result.fcmStatus = 'error';
        result.fcmError = fcmErr.message;
    }

    return result;
};

 
const sendNotificationToSingle = async ({
    userId,
    title,
    body,
    data = {},
    imageUrl,
    clickAction = '/home',
}) => {
    if (!userId) {
        throw new Error('userId is required for sendNotificationToSingle.');
    }
    if (!title || !body) {
        throw new Error('Notification title and body are required.');
    }

    // 1. Create in-app notification in PostgreSQL
    let createdNotification = null;
    try {
        createdNotification = await notificationModel.createNotification({
            userId,
            title,
            body,
            data: { ...data, clickAction },
        });
    } catch (dbErr) {
        console.error(`Notification Failed to save in-app notification for user ${userId}:`, dbErr.message);
    }

    // 2. Fetch active FCM tokens for this single user
    let fcmTokens = [];
    try {
        fcmTokens = await notificationModel.getUserFcmTokens(userId);
    } catch (tokenErr) {
        console.error(`Notification Failed to query FCM tokens for user ${userId}:`, tokenErr.message);
    }

    const result = {
        success: true,
        userId,
        notification: createdNotification,
        tokensFound: fcmTokens.length,
        pushSentCount: 0,
        pushFailedCount: 0,
        cleanedTokensCount: 0,
        fcmStatus: 'no_tokens',
    };

    if (fcmTokens.length === 0) {
        console.log(`Notification Single In-app notification created for user ${userId}. No active FCM tokens found.`);
        return result;
    }

    // 3. Dispatch FCM Push
    const messaging = getMessagingInstance(); 
    if (!messaging) {
        console.warn('Notification Single Firebase Messaging instance not available. Skipping FCM push.');
        result.fcmStatus = 'firebase_unavailable';
        return result;
    }

    const fcmPayload = buildFcmPayload(fcmTokens, { title, body, data, imageUrl, clickAction });
    const pushMetrics = await dispatchMulticast(messaging, fcmPayload, fcmTokens);

    return {
        ...result,
        ...pushMetrics,
    };
};
 
const sendNotificationToMany = async ({
    userIds,
    title,
    body,
    data = {},
    imageUrl,
    clickAction = '/home',
}) => {
    console.log("userIds ==> ", userIds);
    if (!Array.isArray(userIds) || userIds.length === 0) {
        throw new Error('userIds must be a non-empty array for sendNotificationToMany.');
    }
    if (!title || !body) {
        throw new Error('Notification title and body are required.');
    }

    // Deduplicate user IDs
    const uniqueUserIds = [...new Set(userIds.filter(Boolean))];

    // 1. Create in-app notifications in PostgreSQL for each recipient
    const createdNotifications = [];
    for (const uId of uniqueUserIds) {
        try {
            const row = await notificationModel.createNotification({
                userId: uId,
                title,
                body,
                data: { ...data, clickAction },
            });
            createdNotifications.push(row);
        } catch (dbErr) {
            console.error(`[Notification] Failed to save in-app notification for user ${uId}:`, dbErr.message);
        }
    }

    // 2. Fetch all active FCM device tokens for all recipients
    let fcmTokens = [];
    try {
        const rows = await notificationModel.getUsersFcmTokens(uniqueUserIds);
        fcmTokens = rows.map((r) => r.fcm_token);
    } catch (tokenErr) {
        console.error('[Notification] Failed to query FCM tokens for multiple users:', tokenErr.message);
    }

    const result = {
        success: true,
        recipientsCount: uniqueUserIds.length,
        createdNotifications,
        tokensFound: fcmTokens.length,
        pushSentCount: 0,
        pushFailedCount: 0,
        cleanedTokensCount: 0,
        fcmStatus: 'no_tokens',
    };

    if (fcmTokens.length === 0) {
        console.log(`[Notification:Many] In-app notifications created for ${uniqueUserIds.length} users. No active FCM tokens found.`);
        return result;
    }

    // 3. Dispatch FCM Push
    const messaging = getMessagingInstance();
    if (!messaging) {
        console.warn('[Notification:Many] Firebase Messaging instance not available. Skipping FCM push.');
        result.fcmStatus = 'firebase_unavailable';
        return result;
    }

    // Firebase multicast supports up to 500 tokens per batch
    const BATCH_SIZE = 500;
    for (let i = 0; i < fcmTokens.length; i += BATCH_SIZE) {
        const batchTokens = fcmTokens.slice(i, i + BATCH_SIZE);
        const fcmPayload = buildFcmPayload(batchTokens, { title, body, data, imageUrl, clickAction });
        const pushMetrics = await dispatchMulticast(messaging, fcmPayload, batchTokens);

        result.pushSentCount += pushMetrics.pushSentCount;
        result.pushFailedCount += pushMetrics.pushFailedCount;
        result.cleanedTokensCount += pushMetrics.cleanedTokensCount;
        result.fcmStatus = pushMetrics.fcmStatus;
    }

    return result;
};

 
const sendNotification = async (options) => {
    if (Array.isArray(options.userIds) && options.userIds.length > 0) {
        return sendNotificationToMany(options);
    }
    return sendNotificationToSingle(options);
};

module.exports = {
    sendNotificationToSingle,
    sendNotificationToMany,
    sendNotification,
};
