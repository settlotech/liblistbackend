const express = require('express');
const router = express.Router();
const { getChangeLogs } = require('../controllers/changeLogController');
const authenticate = require('../middleware/auth.middleware');
const { checkPermission } = require('../middleware/role.middleware');

// GET /api/change-logs
router.get('/change-logs', authenticate, checkPermission('changelogs', 'read'), getChangeLogs);

module.exports = router;
