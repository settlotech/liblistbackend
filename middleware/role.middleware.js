const AppError = require('../utils/appError');

 
// Check if the user has a specific module:operation permission
//Super Admin bypasses all checks.
// Usage: checkPermission('roles', 'create') or checkPermission('users', 'read')
 
const checkPermission = (moduleName, operationName) => {
    return (req, res, next) => {
        if (!req.user) {
            return next(new AppError('Authentication required', 401));
        }

        // Super Admin bypass: full access
        if (req.user.isSuperAdmin) {
            return next();
        }

        const modules = Array.isArray(moduleName) ? moduleName : [moduleName];
        const userPermissions = req.user.permissionStrings || [];

        const hasAccess = modules.some(m =>
            userPermissions.includes(`${m.toLowerCase()}:${operationName.toLowerCase()}`)
        );

        if (!hasAccess) {
            return next(
                new AppError(
                    `Access denied: You do not have '${operationName}' permission on '${modules.join(' or ')}'`,
                    403
                )
            );
        }

        next();
    };
};

 
// Check if the user has any of the specified roles
// Super Admin bypasses all checks.
// Usage: authorizeRole('admin', 'manager') or authorize('admin')
  
const authorizeRole = (...allowedRoles) => {
    const normalizedAllowed = allowedRoles.map(r => r.toLowerCase());

    return (req, res, next) => {
        if (!req.user) {
            return next(new AppError('Authentication required', 401));
        }

        // Super Admin bypass
        if (req.user.isSuperAdmin) {
            return next();
        }

        const userRoleNames = (req.user.roles || []).map(r => 
            (typeof r === 'string' ? r : r.role_name).toLowerCase()
        );

        if (req.user.role) {
            userRoleNames.push(req.user.role.toLowerCase());
        }

        const hasMatch = normalizedAllowed.some(role => userRoleNames.includes(role));

        if (!hasMatch) {
            return next(
                new AppError('Access denied: Insufficient role permissions', 403)
            );
        }

        next();
    };
};

/**
 * Check if user has AT LEAST ONE of the specified permissions
 * Accepts items as 'module:operation' strings or [module, operation] pairs
 * Usage: authorizeAnyPermission(['users:read', 'users:update'])
 */
const authorizeAnyPermission = (permissionsList) => {
    return (req, res, next) => {
        if (!req.user) {
            return next(new AppError('Authentication required', 401));
        }

        if (req.user.isSuperAdmin) {
            return next();
        }

        const userPermissions = req.user.permissionStrings || [];

        const hasAny = permissionsList.some(item => {
            const permStr = Array.isArray(item) 
                ? `${item[0].toLowerCase()}:${item[1].toLowerCase()}`
                : item.toLowerCase();
            return userPermissions.includes(permStr);
        });

        if (!hasAny) {
            return next(
                new AppError('Access denied: You do not have the required permissions', 403)
            );
        }

        next();
    };
};

 
//Check if user has ALL of the specified permissions
// Usage: authorizeAllPermissions(['roles:create', 'roles:update'])
 
const authorizeAllPermissions = (permissionsList) => {
    return (req, res, next) => {
        if (!req.user) {
            return next(new AppError('Authentication required', 401));
        }

        if (req.user.isSuperAdmin) {
            return next();
        }

        const userPermissions = req.user.permissionStrings || [];

        const hasAll = permissionsList.every(item => {
            const permStr = Array.isArray(item) 
                ? `${item[0].toLowerCase()}:${item[1].toLowerCase()}`
                : item.toLowerCase();
            return userPermissions.includes(permStr);
        });

        if (!hasAll) {
            return next(
                new AppError('Access denied: Missing one or more required permissions', 403)
            );
        }

        next();
    };
};

 
const authorize = authorizeRole;
authorize.authorize = authorizeRole;
authorize.authorizeRole = authorizeRole;
authorize.checkPermission = checkPermission;
authorize.authorizePermission = checkPermission;
authorize.requirePermission = checkPermission;
authorize.authorizeAnyPermission = authorizeAnyPermission;
authorize.authorizeAllPermissions = authorizeAllPermissions;

module.exports = authorize;
