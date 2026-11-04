const express = require('express');
const router = express.Router();

const signupController = require('../controllers/userrequest.controller');
const authenticate = require('../middleware/auth.middleware');
const { emailLimiter, authLimiter } = require('../middleware/rateLimit.middleware');

 
router.post('/request-otp', emailLimiter, signupController.requestOtp);
router.post('/verify-otp', authLimiter, signupController.verifyOtp);
router.post('/resend-otp', emailLimiter, signupController.resendOtp);
router.get('/requests', authenticate, signupController.getAllRequests);
router.patch('/requests/:id', authenticate, signupController.reviewRequest);

router.get('/demo',signupController.demo);
module.exports = router;
