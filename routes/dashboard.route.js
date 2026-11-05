const express = require('express');
const router = express.Router();
const {
    getDashboardOverview,
    getMakerCheckerMetrics,
    getActivityTimeline
} = require('../controllers/dashboard.controller');
const authenticate = require('../middleware/auth.middleware');

// Protect all dashboard endpoints with JWT authentication (Common for all users)
router.use(authenticate);

// GET /api/dashboard/overview - Complete dashboard metrics
router.get('/overview', getDashboardOverview);

// GET /api/dashboard/metrics - Alias for overview
router.get('/metrics', getDashboardOverview);

// GET /api/dashboard/maker-checker - Maker-Checker queue drilldown
router.get('/maker-checker', getMakerCheckerMetrics);

// GET /api/dashboard/activity-timeline - Audit log trend
router.get('/activity-timeline', getActivityTimeline);

module.exports = router;
