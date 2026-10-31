const express = require('express');
const router = express.Router();
const { getDashboardMetrics } = require('../controllers/metricsController');

// GET /api/dashboard-metrics
router.get('/dashboard-metrics', getDashboardMetrics);

module.exports = router;

