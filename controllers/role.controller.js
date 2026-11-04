const roleModel = require('../models/role.model.js');
const rbacModel = require('../models/rbac.model.js');
const AppError = require('../utils/appError.js');

// Create a new Role
const createNewRoleController = async (req, res, next) => {
    try {
        const { role_name, description, is_active } = req.body;

        if (!role_name || !role_name.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Role name is required'
            });
        }

        const roleResult = await roleModel.createRole({
            role_name: role_name.trim(),
            description,
            is_active: is_active !== undefined ? is_active : true
        });

        return res.status(201).json({
            success: true,
            message: 'New role created successfully',
            data: roleResult
        });
    } catch (error) {
        if (error.code === '23505') {
            return next(new AppError('Role name already exists', 409));
        }
        next(error);
    }
};

// Fetch all roles
const fetchRoleController = async (req, res, next) => {
    try {
        const result = await roleModel.fetchRoles();

        return res.status(200).json({
            success: true,
            message: 'Roles fetched successfully',
            data: result
        });
    } catch (error) {
        next(error);
    }
};

// Fetch role by ID (includes its assigned permissions)
const fetchrolebyID = async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!Number.isInteger(Number(id)) || Number(id) <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid role ID'
            });
        }

        const result = await roleModel.fetchRolebyID(id);
        if (!result) {
            return res.status(404).json({
                success: false,
                message: 'Role not found'
            });
        }

        return res.status(200).json({
            success: true,
            data: result
        });
    } catch (error) {
        next(error);
    }
};

// Update an existing role
const updateRoleController = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { role_name, description, is_active } = req.body;

        if (!Number.isInteger(Number(id)) || Number(id) <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid role ID'
            });
        }

        if (!role_name || !role_name.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Role name is required'
            });
        }

        const result = await roleModel.updateRole(id, {
            role_name: role_name.trim(),
            description,
            is_active
        });

        if (!result) {
            return res.status(404).json({
                success: false,
                message: 'Role not found'
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Role updated successfully',
            data: result
        });
    } catch (error) {
        if (error.code === '23505') {
            return next(new AppError('Role name already exists', 409));
        }
        next(error);
    }
};

// Delete a role
const deleteRoleController = async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!Number.isInteger(Number(id)) || Number(id) <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid role ID'
            });
        }

        const role = await roleModel.fetchRolebyID(id);
        if (!role) {
            return res.status(404).json({
                success: false,
                message: 'Role not found'
            });
        }

        // Prevent deleting Super Admin
        if (role.role_name.toLowerCase() === 'super admin' || role.role_name.toLowerCase() === 'super_admin') {
            return res.status(403).json({
                success: false,
                message: 'The Super Admin role cannot be deleted'
            });
        }

        const result = await roleModel.deleteRole(id);
        return res.status(200).json({
            success: true,
            message: 'Role and associated permissions deleted successfully',
            data: result
        });
    } catch (error) {
        next(error);
    }
};

// Get permissions assigned to a role
const getRolePermissionsController = async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!Number.isInteger(Number(id)) || Number(id) <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid role ID'
            });
        }

        const role = await roleModel.fetchRolebyID(id);
        if (!role) {
            return res.status(404).json({
                success: false,
                message: 'Role not found'
            });
        }

        const permissions = await rbacModel.getRolePermissions(id);
        return res.status(200).json({
            success: true,
            role_id: Number(id),
            role_name: role.role_name,
            data: permissions
        });
    } catch (error) {
        next(error);
    }
};

// Assign/sync permissions to a role
const assignRolePermissionsController = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { permissions } = req.body;

        if (!Number.isInteger(Number(id)) || Number(id) <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid role ID'
            });
        }

        if (!Array.isArray(permissions)) {
            return res.status(400).json({
                success: false,
                message: 'Permissions must be an array of permissions or { moduleId, operationId } objects'
            });
        }

        const updatedPermissions = await rbacModel.assignPermissionsToRole(id, permissions);
        return res.status(200).json({
            success: true,
            message: 'Role permissions updated successfully',
            data: updatedPermissions
        });
    } catch (error) {
        next(error);
    }
};

// Get Permission Matrix (all modules, operations, and permissions)
const getPermissionMatrixController = async (req, res, next) => {
    try {
        const matrix = await rbacModel.getPermissionMatrix();
        return res.status(200).json({
            success: true,
            data: matrix
        });
    } catch (error) {
        next(error);
    }
};

// Fetch all modules
const getModulesController = async (req, res, next) => {
    try {
        const modules = await rbacModel.fetchModules();
        return res.status(200).json({
            success: true,
            data: modules
        });
    } catch (error) {
        next(error);
    }
};

// Create a new module
const createModuleController = async (req, res, next) => {
    try {
        const { module_name, display_name, is_active } = req.body;
        if (!module_name || !display_name) {
            return res.status(400).json({
                success: false,
                message: 'module_name and display_name are required'
            });
        }

        const newModule = await rbacModel.createModule({
            module_name,
            display_name,
            is_active
        });

        return res.status(201).json({
            success: true,
            message: 'Module created successfully',
            data: newModule
        });
    } catch (error) {
        if (error.code === '23505') {
            return next(new AppError('Module name already exists', 409));
        }
        next(error);
    }
};

// Fetch all operations
const getOperationsController = async (req, res, next) => {
    try {
        const operations = await rbacModel.fetchOperations();
        return res.status(200).json({
            success: true,
            data: operations
        });
    } catch (error) {
        next(error);
    }
};

// Create a new operation
const createOperationController = async (req, res, next) => {
    try {
        const { operation_name, display_name } = req.body;
        if (!operation_name || !display_name) {
            return res.status(400).json({
                success: false,
                message: 'operation_name and display_name are required'
            });
        }

        const newOperation = await rbacModel.createOperation({
            operation_name,
            display_name
        });

        return res.status(201).json({
            success: true,
            message: 'Operation created successfully',
            data: newOperation
        });
    } catch (error) {
        if (error.code === '23505') {
            return next(new AppError('Operation name already exists', 409));
        }
        next(error);
    }
};

module.exports = {
    createNewRoleController,
    fetchRoleController,
    fetchrolebyID,
    updateRoleController,
    deleteRoleController,
    
    getRolePermissionsController,
    assignRolePermissionsController,
    getPermissionMatrixController,
    getModulesController,
    createModuleController,
    getOperationsController,
    createOperationController
};
