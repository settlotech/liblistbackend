const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const connectionString = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_9fAEbXjBdqT5@ep-blue-lab-b4ctk84r-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require';

const pool = (process.env.DATABASE_URL || !process.env.DB_HOST)
  ? new Pool({
      connectionString,
      ssl: {
        rejectUnauthorized: false
      },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000
    })
  : new Pool({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 5432),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000
    });

pool.on('error', (error) => {
    console.error('Unexpected PostgreSQL pool error:', error);
});

module.exports = pool;
