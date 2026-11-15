const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notification.controller');
const authenticate = require('../middleware/auth.middleware');

router.post('/demo-send', notificationController.sendDemoNotification);
// All notification operations require authentication
router.use(authenticate);

//  FCM Device Token Registration
router.post('/fcm-token', notificationController.saveFcmToken);
router.delete('/fcm-token', notificationController.removeFcmToken);

// In-App Notifications List & Status
router.get('/', notificationController.getNotifications);
router.patch('/read-all', notificationController.markAllAsRead);
router.patch('/:id/read', notificationController.markAsRead);
router.delete('/:id', notificationController.deleteNotification);




module.exports = router;
