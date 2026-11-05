const router = require('express').Router();
const roleController = require('../controllers/role.controller');
const authenticate = require('../middleware/auth.middleware');
const { checkPermission } = require('../middleware/role.middleware');

// Apply authentication to all role routes
router.use(authenticate);

 
router.get('/permissions-matrix', checkPermission(['permissions', 'roles'], 'read'), roleController.getPermissionMatrixController);

router.get('/modules', checkPermission(['permissions', 'roles'], 'read'), roleController.getModulesController);
router.post('/modules', checkPermission(['permissions', 'roles'], 'create'), roleController.createModuleController);

router.get('/operations', checkPermission(['permissions', 'roles'], 'read'), roleController.getOperationsController);
router.post('/operations', checkPermission(['permissions', 'roles'], 'create'), roleController.createOperationController);

 
router.get('/', checkPermission('roles', 'read'), roleController.fetchRoleController);
router.post('/', checkPermission('roles', 'create'), roleController.createNewRoleController);
router.post('/newrole', checkPermission('roles', 'create'), roleController.createNewRoleController); // legacy endpoint support

 
// Role Permissions Assignment 
router.get('/:id/permissions', checkPermission(['permissions', 'roles'], 'read'), roleController.getRolePermissionsController);
router.post('/:id/permissions', checkPermission(['permissions', 'roles'], 'update'), roleController.assignRolePermissionsController);
router.put('/:id/permissions', checkPermission(['permissions', 'roles'], 'update'), roleController.assignRolePermissionsController);

 
// Single Role Operations 
router.get('/:id', checkPermission('roles', 'read'), roleController.fetchrolebyID);
router.put('/:id', checkPermission('roles', 'update'), roleController.updateRoleController);
router.delete('/:id', checkPermission('roles', 'delete'), roleController.deleteRoleController);

module.exports = router;
