const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
});

pool.on('error', (error) => {
    console.error('Unexpected PostgreSQL pool error:', error);
});

// Bind raw query method so it can be destructured safely: const { query } = require('../config/db');
const rawQuery = pool.query.bind(pool);
const query = (text, params) => rawQuery(text, params);

const withTransaction = async (callback) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

const closePool = () => pool.end();

pool.query = rawQuery;
pool.withTransaction = withTransaction;
pool.closePool = closePool;

module.exports = pool;
module.exports.query = query;
module.exports.withTransaction = withTransaction;
module.exports.closePool = closePool;
module.exports.pool = pool;
