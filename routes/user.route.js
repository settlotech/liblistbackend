const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const authenticate = require('../middleware/auth.middleware');
const { checkPermission } = require('../middleware/role.middleware');
const { emailLimiter } = require('../middleware/rateLimit.middleware');


// Public password recovery routes
router.get('/resetinfo/:id', userController.getUserResetInfo);
router.post('/checkemailid', emailLimiter, userController.userEmailavailable);
router.post('/resendotp/:id', emailLimiter, userController.resendOtp);
router.post('/verifyotp/:id', userController.verifyOtp);
router.post('/resetpassword/:id', userController.resetPasswordWithToken);

// All user management routes require authentication and dynamic RBAC checks
router.use(authenticate);

// List users with roles
router.get('/', checkPermission('users', 'read'), userController.getAllUsers);

// Get single user by ID
router.get('/:id', checkPermission('users', 'read'), userController.getUserById);

// Create a new user with assigned roles
router.post('/', checkPermission('users', 'create'), userController.createUser);

// Update user details and roles
router.put('/:id', checkPermission('users', 'update'), userController.updateUser);

// Delete user
router.delete('/:id', checkPermission('users', 'delete'), userController.deleteUser);

// Get roles and permissions for a specific user
router.get('/:id/roles', checkPermission('users', 'read'), userController.getUserRoles);

// Assign/update roles for a specific user
router.post('/:id/roles', checkPermission('users', 'update'), userController.assignUserRoles);



module.exports = router;
