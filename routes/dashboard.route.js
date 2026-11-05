const express = require('express');
const router = express.Router();
const {
    getDashboardOverview,
    getMakerCheckerMetrics,
    getActivityTimeline
} = require('../controllers/dashboard.controller');
const authenticate = require('../middleware/auth.middleware');
const { checkPermission } = require('../middleware/role.middleware');

// Protect all dashboard endpoints with JWT authentication
router.use(authenticate);

// GET /api/dashboard/overview - Complete dashboard metrics
router.get('/overview', checkPermission('dashboard', 'read'), getDashboardOverview);

// GET /api/dashboard/metrics - Alias for overview
router.get('/metrics', checkPermission('dashboard', 'read'), getDashboardOverview);

// GET /api/dashboard/maker-checker - Maker-Checker queue drilldown
router.get('/maker-checker', checkPermission('dashboard', 'read'), getMakerCheckerMetrics);

// GET /api/dashboard/activity-timeline - Audit log trend
router.get('/activity-timeline', checkPermission('dashboard', 'read'), getActivityTimeline);

module.exports = router;
