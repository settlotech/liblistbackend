const pool = require('./config/db');

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};
