const router = require('express').Router();
const roleController = require('../controllers/role.controller');
const authenticate = require('../middleware/auth.middleware');
const { checkPermission } = require('../middleware/role.middleware');

// Apply authentication to all role routes
router.use(authenticate);

// ==========================================
// Modules & Operations & Matrix (Specific routes first)
// ==========================================
router.get('/permissions-matrix', checkPermission('roles', 'read'), roleController.getPermissionMatrixController);

router.get('/modules', checkPermission('roles', 'read'), roleController.getModulesController);
router.post('/modules', checkPermission('roles', 'create'), roleController.createModuleController);

router.get('/operations', checkPermission('roles', 'read'), roleController.getOperationsController);
router.post('/operations', checkPermission('roles', 'create'), roleController.createOperationController);

// ==========================================
// Roles CRUD
// ==========================================
router.get('/', checkPermission('roles', 'read'), roleController.fetchRoleController);
router.post('/', checkPermission('roles', 'create'), roleController.createNewRoleController);
router.post('/newrole', checkPermission('roles', 'create'), roleController.createNewRoleController); // legacy endpoint support

// ==========================================
// Role Permissions Assignment
// ==========================================
router.get('/:id/permissions', checkPermission('roles', 'read'), roleController.getRolePermissionsController);
router.post('/:id/permissions', checkPermission('roles', 'update'), roleController.assignRolePermissionsController);
router.put('/:id/permissions', checkPermission('roles', 'update'), roleController.assignRolePermissionsController);

// ==========================================
// Single Role Operations
// ==========================================
router.get('/:id', checkPermission('roles', 'read'), roleController.fetchrolebyID);
router.put('/:id', checkPermission('roles', 'update'), roleController.updateRoleController);
router.delete('/:id', checkPermission('roles', 'delete'), roleController.deleteRoleController);

module.exports = router;
