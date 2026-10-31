const fs = require('fs');
const path = require('path');
const pool = require('../config/db');

const initDatabase = async () => {
    try {
        const schemaPath = path.join(__dirname, 'schema.sql');
        const sql = fs.readFileSync(schemaPath, 'utf8'); 
        await pool.query(sql);
        console.log('Database tables created successfully');
    } catch (error) {
        console.error('Database initialization failed:', error);
        throw error;
    }
};

module.exports = initDatabase;