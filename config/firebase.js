const admin = require('firebase-admin');
let firebaseApp = null;
let isInitialized = false;

function getFirebaseAdmin() {
    if (isInitialized && firebaseApp) {
        return admin;
    }

    try {
        if (admin.apps.length > 0) {
            firebaseApp = admin.app();
            isInitialized = true;
            return admin;
        }

        const projectId = process.env.FIREBASE_PROJECT_ID ;

        // 1. Check if full service account JSON is passed via env variable
        if (process.env.FIREBASE_SERVICE_ACCOUNT) {
            const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
            firebaseApp = admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
                projectId: serviceAccount.project_id || projectId,
            });
            console.log('[Firebase] Admin initialized with service account credential');
        }
        // 2. Check if a path to service account JSON is configured
        else if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
            const serviceAccount = require(process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
            firebaseApp = admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
                projectId: serviceAccount.project_id || projectId,
            });
            console.log('[Firebase] Admin initialized with service account file');
        }
        // 3. Fall back to applicationDefault / projectId
        else {
            firebaseApp = admin.initializeApp({
                projectId: projectId,
            });
            console.log(`[Firebase] Admin initialized for project: ${projectId}`);
        }

        isInitialized = true;
    } catch (err) {
        console.warn('[Firebase] Initialization warning:', err.message);
    }

    return admin;
}

function getMessagingInstance() {
    getFirebaseAdmin();
    try {
        return admin.messaging();
    } catch (err) {
        console.warn('[Firebase] Messaging instance error:', err.message);
        return null;
    }
}

module.exports = {
    admin,
    getFirebaseAdmin,
    getMessagingInstance,
};
