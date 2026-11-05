const express = require('express');
const router = express.Router();
const { getChangeLogs } = require('../controllers/changeLogController');
const authenticate = require('../middleware/auth.middleware');

// GET /api/change-logs (Common for all users)
router.get('/change-logs', authenticate, getChangeLogs);

module.exports = router;
