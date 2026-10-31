const pool = require('../config/db');
const crypto = require('crypto');

const createUser = async ({ id, name, email, password, role = 'employee', role_type = 'employee', department = 'Retail Banking' }) => { 
    const userId = id || `user-${crypto.randomUUID()}`;
    const query = `
        INSERT INTO users (id, name, email, password, role, role_type, department)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, name, email, role, role_type, department, is_active, created_at
    `;
    const result = await pool.query(query, [
        userId,
        name,
        email,
        password,
        role,
        role_type,
        department
    ]); 
    return result.rows[0];
};

const findByEmail = async (email) => {
    const query = `
        SELECT *
        FROM users
        WHERE LOWER(email) = LOWER($1)
    `;
    const result = await pool.query(query, [email]);
    return result.rows[0];
};

const findById = async (id) => {
    const query = `
        SELECT id, name, email, role, role_type, department, avatar, bank_id, is_active, created_at
        FROM users
        WHERE id = $1
    `;

    const result = await pool.query(query, [id]);
    return result.rows[0];
};

const updateProfile = async (id, name) => {
    const query = `
        UPDATE users
        SET name = $1,
            updated_at = NOW()
        WHERE id = $2
        RETURNING id, name, email, role, role_type, department, avatar, is_active, created_at
    `;

    const result = await pool.query(query, [name, id]);
    return result.rows[0];
};

const updatePassword = async (id, password) => {
    const query = `
        UPDATE users
        SET password = $1,
            token_version = token_version + 1,
            updated_at = NOW()
        WHERE id = $2
    `;

    await pool.query(query, [password, id]);
};

module.exports = {
    createUser,
    findByEmail,
    findById,
    updateProfile,
    updatePassword
};
