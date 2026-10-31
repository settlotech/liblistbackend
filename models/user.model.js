const pool = require('../config/db');

const createUser = async ({ name, email, password }) => { 
    const query = `
        INSERT INTO users (name, email, password)
        VALUES ($1, $2, $3)
        RETURNING id, name, email, role, is_active, created_at
    `;
    const result = await pool.query(query, [
        name,
        email,
        password
    ]); 
    return result.rows[0];
};

const findByEmail = async (email) => {
    const query = `
        SELECT *
        FROM users
        WHERE email = $1
    `;
    const result = await pool.query(query, [email]);
    return result.rows[0];
};

const findById = async (id) => {

    const query = `
        SELECT id, name, email, role, is_active, created_at
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
        RETURNING id, name, email, role, is_active, created_at
    `;

    const result = await pool.query(query, [name, id]);

    return result.rows[0];
};

const updatePassword = async (id, password) => {

    const query = `
        UPDATE users
        SET password = $1,
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