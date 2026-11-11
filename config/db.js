const { Pool } = require('pg');
require('dotenv').config();

const isRemoteDb = process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('localhost') && !process.env.DATABASE_URL.includes('127.0.0.1');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: isRemoteDb
        ? { rejectUnauthorized: false }
        : false, 
    max: 20,
    min: 2,
    keepAlive: true,
    idleTimeoutMillis: 120000,
    connectionTimeoutMillis: 10000
});

pool.on('error', (error) => {
    console.error('Unexpected PostgreSQL pool error:', error);
});

// Capture native pool query method before any overrides
const rawQuery = pool.query.bind(pool);

/**
 * Parameterized SQL query execution
 * @param {string} text - SQL string
 * @param {Array} params - Array of parameters
 */
const query = (text, params) => rawQuery(text, params);

/**
 * Managed PostgreSQL transaction helper
 * Automatically handles BEGIN, COMMIT, and ROLLBACK
 * @param {Function} callback - Async function receiving client instance
 */
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

pool.withTransaction = withTransaction;
pool.closePool = closePool;

module.exports = pool;
module.exports.query = query;
module.exports.withTransaction = withTransaction;
module.exports.closePool = closePool;
module.exports.pool = pool;
