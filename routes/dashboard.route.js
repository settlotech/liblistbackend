const express = require('express');
const router = express.Router();
const {
    getDashboardOverview,
    getMakerCheckerMetrics,
    getActivityTimeline
} = require('../controllers/dashboard.controller');
 
router.get('/overview', getDashboardOverview);
  
// GET /api/dashboard/maker-checker - Maker-Checker queue drilldown
router.get('/maker-checker', getMakerCheckerMetrics);

// GET /api/dashboard/activity-timeline - Audit log trend
router.get('/activity-timeline', getActivityTimeline);

module.exports = router;
