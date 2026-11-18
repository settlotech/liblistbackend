const { Pool } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL;
const isVercel = Boolean(process.env.VERCEL);

let poolConfig;
if (connectionString) {
    const isLocalConn =
        connectionString.includes('localhost') ||
        connectionString.includes('127.0.0.1');
    poolConfig = {
        connectionString,
        ssl: isLocalConn && process.env.DB_SSL !== 'true'
            ? false
            : { rejectUnauthorized: false },
        max: isVercel ? 5 : 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
    };
} else {
    const host = process.env.DB_HOST || '127.0.0.1';
    const isLocalHost = host === 'localhost' || host === '127.0.0.1';
    poolConfig = {
        host,
        port: Number(process.env.DB_PORT || 5432),
        database: process.env.DB_NAME || 'liblist_draft1',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
        ssl: !isLocalHost || process.env.DB_SSL === 'true'
            ? { rejectUnauthorized: false }
            : false,
        max: isVercel ? 5 : 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
    };
}

const pool = new Pool(poolConfig);

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
