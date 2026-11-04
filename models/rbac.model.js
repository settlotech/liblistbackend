const pool = require('../config/db');

 
// Get all active roles assigned to a user 
const getUserRoles = async (userId) => {
    const query = `
        SELECT 
            r.id,
            r.role_name,
            r.description,
            r.is_active
        FROM roles r
        INNER JOIN user_roles ur ON ur.role_id = r.id
        WHERE ur.user_id = $1 AND r.is_active = TRUE
        ORDER BY r.id ASC;
    `;
    const result = await pool.query(query, [userId]);
    return result.rows;
};


// Get all permissions granted to a user across all active assigned roles
const getUserPermissions = async (userId) => {
    const query = `
        SELECT DISTINCT
            m.id AS module_id,
            m.module_name,
            m.display_name AS module_display_name,
            o.id AS operation_id,
            o.operation_name,
            o.display_name AS operation_display_name
        FROM user_roles ur
        INNER JOIN roles r ON r.id = ur.role_id AND r.is_active = TRUE
        INNER JOIN role_permissions rp ON rp.role_id = r.id
        INNER JOIN modules m ON m.id = rp.module_id AND m.is_active = TRUE
        INNER JOIN operations o ON o.id = rp.operation_id
        WHERE ur.user_id = $1
        ORDER BY m.module_name, o.operation_name;
    `;
    const result = await pool.query(query, [userId]);
    const permissions = result.rows;

    // Build fast lookup strings e.g. ['users:read', 'roles:create']
    const permissionStrings = permissions.map(
        p => `${p.module_name.toLowerCase()}:${p.operation_name.toLowerCase()}`
    );

    return {
        permissions,
        permissionStrings
    };
};


//Check if a user has a specific permission (or super admin access)
const hasUserPermission = async (userId, moduleName, operationName) => {
    // Check if user has Super Admin role first
    const roles = await getUserRoles(userId);
    const isSuperAdmin = roles.some(r => r.role_name.toLowerCase() === 'super admin' || r.role_name.toLowerCase() === 'super_admin');
    if (isSuperAdmin) {
        return true;
    }

    const query = `
        SELECT 1
        FROM user_roles ur
        INNER JOIN roles r ON r.id = ur.role_id AND r.is_active = TRUE
        INNER JOIN role_permissions rp ON rp.role_id = r.id
        INNER JOIN modules m ON m.id = rp.module_id AND m.is_active = TRUE
        INNER JOIN operations o ON o.id = rp.operation_id
        WHERE ur.user_id = $1
          AND LOWER(m.module_name) = LOWER($2)
          AND LOWER(o.operation_name) = LOWER($3)
        LIMIT 1;
    `;
    const result = await pool.query(query, [userId, moduleName, operationName]);
    return result.rowCount > 0;
};

// Assign roles to a user (replaces existing role assignments)
const assignRolesToUser = async (userId, roleIds) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Delete current role assignments for user
        await client.query('DELETE FROM user_roles WHERE user_id = $1', [userId]);

        // Insert new role assignments if roleIds provided
        if (Array.isArray(roleIds) && roleIds.length > 0) {
            const values = [];
            const placeholders = roleIds.map((roleId, idx) => {
                values.push(userId, roleId);
                const offset = idx * 2;
                return `($${offset + 1}, $${offset + 2})`;
            }).join(', ');

            const query = `
                INSERT INTO user_roles (user_id, role_id)
                VALUES ${placeholders}
                ON CONFLICT (user_id, role_id) DO NOTHING;
            `;
            await client.query(query, values);
        }

        await client.query('COMMIT');
        return await getUserRoles(userId);
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

// Get permissions assigned to a specific role
const getRolePermissions = async (roleId) => {
    const query = `
        SELECT 
            rp.id AS permission_id,
            rp.role_id,
            m.id AS module_id,
            m.module_name,
            m.display_name AS module_display_name,
            o.id AS operation_id,
            o.operation_name,
            o.display_name AS operation_display_name
        FROM role_permissions rp
        INNER JOIN modules m ON m.id = rp.module_id
        INNER JOIN operations o ON o.id = rp.operation_id
        WHERE rp.role_id = $1
        ORDER BY m.module_name, o.operation_name;
    `;
    const result = await pool.query(query, [roleId]);
    return result.rows;
};

/**
 * Assign/sync permissions to a role in a single transaction
 * Accepts array of { moduleId, operationId } or { module_id, operation_id } or strings 'module:operation'
 */
const assignPermissionsToRole = async (roleId, permissions) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Verify role exists
        const roleCheck = await client.query('SELECT id, role_name FROM roles WHERE id = $1', [roleId]);
        if (roleCheck.rowCount === 0) {
            throw new Error('Role not found');
        }

        // Wipe old permissions for this role
        await client.query('DELETE FROM role_permissions WHERE role_id = $1', [roleId]);

        if (Array.isArray(permissions) && permissions.length > 0) {
            // Resolve permissions if they are strings like 'users:read'
            const resolvedPairs = [];

            // Pre-fetch all modules & operations for name resolution
            const modulesResult = await client.query('SELECT id, module_name FROM modules');
            const operationsResult = await client.query('SELECT id, operation_name FROM operations');

            const moduleMap = new Map(modulesResult.rows.map(m => [m.module_name.toLowerCase(), m.id]));
            const operationMap = new Map(operationsResult.rows.map(o => [o.operation_name.toLowerCase(), o.id]));

            for (const item of permissions) {
                if (typeof item === 'string') {
                    const [modName, opName] = item.split(':').map(s => s.trim().toLowerCase());
                    const modId = moduleMap.get(modName);
                    const opId = operationMap.get(opName);
                    if (modId && opId) {
                        resolvedPairs.push({ moduleId: modId, operationId: opId });
                    }
                } else if (typeof item === 'object' && item !== null) {
                    const modId = item.moduleId || item.module_id;
                    const opId = item.operationId || item.operation_id;
                    if (modId && opId) {
                        resolvedPairs.push({ moduleId: Number(modId), operationId: Number(opId) });
                    }
                }
            }

            if (resolvedPairs.length > 0) {
                // Deduplicate pairs
                const uniquePairs = Array.from(
                    new Set(resolvedPairs.map(p => `${p.moduleId}_${p.operationId}`))
                ).map(str => {
                    const [moduleId, operationId] = str.split('_').map(Number);
                    return { moduleId, operationId };
                });

                const values = [];
                const placeholders = uniquePairs.map((p, idx) => {
                    values.push(roleId, p.moduleId, p.operationId);
                    const offset = idx * 3;
                    return `($${offset + 1}, $${offset + 2}, $${offset + 3})`;
                }).join(', ');

                const insertQuery = `
                    INSERT INTO role_permissions (role_id, module_id, operation_id)
                    VALUES ${placeholders}
                    ON CONFLICT (role_id, module_id, operation_id) DO NOTHING;
                `;
                await client.query(insertQuery, values);
            }
        }

        await client.query('COMMIT');
        return await getRolePermissions(roleId);
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

/**
 * Fetch all modules
 */
const fetchModules = async () => {
    const query = 'SELECT * FROM modules ORDER BY id ASC';
    const result = await pool.query(query);
    return result.rows;
};

/**
 * Create a new module
 */
const createModule = async ({ module_name, display_name, is_active = true }) => {
    const query = `
        INSERT INTO modules (module_name, display_name, is_active)
        VALUES ($1, $2, $3)
        RETURNING *;
    `;
    const result = await pool.query(query, [
        module_name.trim().toLowerCase(),
        display_name.trim(),
        is_active
    ]);
    return result.rows[0];
};

/**
 * Fetch all operations
 */
const fetchOperations = async () => {
    const query = 'SELECT * FROM operations ORDER BY id ASC';
    const result = await pool.query(query);
    return result.rows;
};

/**
 * Create a new operation
 */
const createOperation = async ({ operation_name, display_name }) => {
    const query = `
        INSERT INTO operations (operation_name, display_name)
        VALUES ($1, $2)
        RETURNING *;
    `;
    const result = await pool.query(query, [
        operation_name.trim().toLowerCase(),
        display_name.trim()
    ]);
    return result.rows[0];
};

/**
 * Get the full permission matrix (all modules, operations, roles, and assigned permissions)
 * Useful for the frontend permissions management screen!
 */
const getPermissionMatrix = async () => {
    const modules = await fetchModules();
    const operations = await fetchOperations();
    const rolesQuery = await pool.query('SELECT id, role_name, description, is_active FROM roles ORDER BY id ASC');
    const roles = rolesQuery.rows;

    const permissionsQuery = await pool.query(`
        SELECT 
            role_id,
            module_id,
            operation_id
        FROM role_permissions
    `);

    return {
        modules,
        operations,
        roles,
        assignments: permissionsQuery.rows
    };
};

module.exports = {
    getUserRoles,
    getUserPermissions,

    hasUserPermission,

    assignRolesToUser,

    getRolePermissions,

    assignPermissionsToRole,
    
    createModule,
    createOperation,
    
    fetchModules,
    fetchOperations,

    getPermissionMatrix
};
