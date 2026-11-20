const fs = require('fs');
const path = require('path');
const db = require('../config/db');

const resetSqlPath = path.join(__dirname, 'migrations', 'reset_all_application_tables.sql');

const resetAllTables = async () => {
    try {
        const sql = fs.readFileSync(resetSqlPath, 'utf8');
        await db.query(sql);
        console.log('All application tables were cleared and identity sequences were reset.');
    } catch (error) {
        console.error('Failed to reset application tables:', error.message);
        process.exitCode = 1;
    } finally {
        await db.closePool();
    }
};

resetAllTables();
