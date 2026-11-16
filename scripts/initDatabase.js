require('dotenv').config();

const initializeDatabase = require('../database/initDatabase');

initializeDatabase()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
