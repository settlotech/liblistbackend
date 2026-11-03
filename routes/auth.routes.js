const express = require('express');
const router = express.Router();
const AuthController = require('../controllers/auth.controller');
const authenticate = require('../middleware/auth.middleware');
const validate = require('../middleware/validate.middleware');

const { loginLimiter, authLimiter } = require('../middleware/rateLimit.middleware');
const { registerSchema, loginSchema, profileSchema, changePasswordSchema } = require('../validators/auth.validator');

// Public APIs
router.post('/register', authLimiter, validate(registerSchema), AuthController.register);
router.post('/login', loginLimiter, validate(loginSchema), AuthController.login);
router.post('/refresh', authLimiter, AuthController.refresh); 
router.post('/logout', AuthController.logout);

router.get('/tokencheck', authenticate, (req, res) => { return res.status(200).json({ message: "Working" }); });

// Protected APIs  
router.post('/logout-all', authenticate, AuthController.logoutAll);
router.get('/profile', authenticate, AuthController.profile);
router.patch('/profile', authenticate, validate(profileSchema), AuthController.updateProfile);
router.patch('/change-password', authenticate, validate(changePasswordSchema), AuthController.changePassword);

module.exports = router;
