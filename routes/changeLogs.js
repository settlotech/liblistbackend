const express = require('express');
const router = express.Router();
const { getChangeLogs } = require('../controllers/changeLogController');

// GET /api/change-logs
router.get('/change-logs', getChangeLogs);

module.exports = router;

