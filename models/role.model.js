const pool = require('../config/db');
const rbacModel = require('./rbac.model');

const createRole = async ({ role_name, description, is_active = true }) => {
    const query = `INSERT INTO roles (role_name, description, is_active) VALUES ($1, $2, $3) RETURNING *;`;
    const result = await pool.query(query, [role_name, description, is_active]);
    return result.rows[0];
};

const fetchRoles = async () => {
    const query = `
        SELECT 
            r.id,
            r.role_name,
            r.description,
            r.is_active,
            r.created_at,
            COUNT(DISTINCT ur.user_id)::int AS user_count,
            COUNT(DISTINCT rp.id)::int AS permission_count
        FROM roles r
        LEFT JOIN user_roles ur ON ur.role_id = r.id
        LEFT JOIN role_permissions rp ON rp.role_id = r.id
        GROUP BY r.id
        ORDER BY r.id ASC;
    `;
    const result = await pool.query(query);
    return result.rows;
};

const deleteRole = async (roleId) => {
    const query = `DELETE FROM roles WHERE id = $1 RETURNING *`;
    const result = await pool.query(query, [roleId]);
    return result.rows[0];
};

const fetchRolebyID = async (roleId) => {
    const query = `SELECT * FROM roles WHERE id = $1`;
    const result = await pool.query(query, [roleId]);
    if (!result.rows[0]) return null;

    const permissions = await rbacModel.getRolePermissions(roleId);
    return {
        ...result.rows[0],
        permissions
    };
};

const updateRole = async (roleId, { role_name, description, is_active }) => {
    const query = `UPDATE roles SET role_name = $1, description = $2, is_active = $3 WHERE id = $4 RETURNING *`;
    const result = await pool.query(query, [
        role_name,
        description,
        is_active,
        roleId
    ]);
    return result.rows[0];
};

const getRolePermissions = async (roleId) => {
    return await rbacModel.getRolePermissions(roleId);
};

const assignPermissionsToRole = async (roleId, permissions) => {
    return await rbacModel.assignPermissionsToRole(roleId, permissions);
};

module.exports = {
    createRole,
    fetchRoles,
    deleteRole,
    fetchRolebyID,
    updateRole,
    getRolePermissions,
    assignPermissionsToRole
};
