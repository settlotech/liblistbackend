const notificationModel = require('../models/notification.model');
const {
    sendNotificationToSingle,
    sendNotificationToMany,
    sendNotification,
} = require('../services/notification.service');
const AppError = require('../utils/appError');

 
const saveFcmToken = async (req, res, next) => {
    try {
        const { fcm_token, device_info } = req.body;
        const userId = req.user?.id;

        if (!userId) {
            return next(new AppError('Unauthorized: User not authenticated', 401));
        }

        if (!fcm_token || typeof fcm_token !== 'string') {
            return next(new AppError('A valid fcm_token string is required.', 400));
        }

        const saved = await notificationModel.saveFcmToken(
            userId,
            fcm_token.trim(),
            device_info || req.headers['user-agent'] || 'Web Browser'
        );

        return res.status(200).json({
            success: true,
            message: 'FCM device token registered successfully.',
            data: {
                id: saved.id,
                user_id: saved.user_id,
                device_info: saved.device_info,
                updated_at: saved.updated_at,
            },
        });
    } catch (err) {
        next(err);
    }
};

 
const removeFcmToken = async (req, res, next) => {
    try {
        const { fcm_token } = req.body;
        const userId = req.user?.id;

        if (!userId) {
            return next(new AppError('Unauthorized', 401));
        }

        if (!fcm_token) {
            return next(new AppError('fcm_token is required to unsubscribe device.', 400));
        }

        await notificationModel.removeFcmToken(userId, fcm_token.trim());

        return res.status(200).json({
            success: true,
            message: 'FCM device token removed successfully.',
        });
    } catch (err) {
        next(err);
    }
};

 
const getNotifications = async (req, res, next) => {
    try {
        const userId = req.user?.id;
        const limit = Math.min(Number(req.query.limit) || 30, 100);
        const offset = Number(req.query.offset) || 0;
        const unreadOnly = req.query.unreadOnly === 'true';

        const [notifications, unreadCount] = await Promise.all([
            notificationModel.getUserNotifications(userId, { limit, offset, unreadOnly }),
            notificationModel.getUnreadCount(userId),
        ]);

        return res.status(200).json({
            success: true,
            data: {
                notifications,
                unreadCount,
                limit,
                offset,
            },
        });
    } catch (err) {
        next(err);
    }
};

 
const markAsRead = async (req, res, next) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;

        const updated = await notificationModel.markAsRead(id, userId);
        if (!updated) {
            return next(new AppError('Notification not found or access denied.', 404));
        }

        const unreadCount = await notificationModel.getUnreadCount(userId);

        return res.status(200).json({
            success: true,
            message: 'Notification marked as read.',
            data: { id: updated.id, is_read: updated.is_read, unreadCount },
        });
    } catch (err) {
        next(err);
    }
};

 
const markAllAsRead = async (req, res, next) => {
    try {
        const userId = req.user?.id;
        const affected = await notificationModel.markAllAsRead(userId);

        return res.status(200).json({
            success: true,
            message: 'All notifications marked as read.',
            data: { affected, unreadCount: 0 },
        });
    } catch (err) {
        next(err);
    }
};

 
const deleteNotification = async (req, res, next) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;

        const deleted = await notificationModel.deleteNotification(id, userId);
        if (!deleted) {
            return next(new AppError('Notification not found.', 404));
        }

        return res.status(200).json({
            success: true,
            message: 'Notification deleted.',
        });
    } catch (err) {
        next(err);
    }
};

 
const sendDemoNotification = async (req, res, next) => {
    try {
        const { userIds, userId, title, body, data, clickAction } = req.body;
        const defaultTitle = title || 'LibList Notification Test';
        const defaultBody = `your centralized notification pipeline is working smoothly at ${new Date().toLocaleTimeString()}!`;
        const payloadData = data || { type: 'test_notification', testId: String(Date.now()) };
        const actionUrl = clickAction || '/home'; 
        let notificationResult; 
        // If multiple user IDs are passed, use sendNotificationToMany
        if (Array.isArray(userIds) && userIds.length > 0) {
            notificationResult = await sendNotificationToMany({
                userIds,
                title: defaultTitle,
                body: defaultBody,
                data: payloadData,
                clickAction: actionUrl,
            });
        } else {
            // Otherwise default to target single user (or current authenticated user)
            const targetUserId = userId || req.user?.id;
            if (!targetUserId) {
                return next(new AppError('Target userId or userIds array is required.', 400));
            }

            notificationResult = await sendNotificationToSingle({
                userId: targetUserId,
                title: defaultTitle,
                body: defaultBody,
                data: payloadData,
                clickAction: actionUrl,
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Demo notification triggered successfully.',
            data: {
                triggeredBy: {
                    userId: req.user?.id,
                    userName: req.user?.name,
                    userEmail: req.user?.email,
                },
                ...notificationResult,
            },
        });
    } catch (err) {
        next(err);
    }
};

module.exports = {
    saveFcmToken,
    removeFcmToken,
    getNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    sendDemoNotification,
};
