const express = require('express');
const router = express.Router();

const departmentsRouter = require('./departments');
const policiesRouter = require('./policies');
const makerCheckerRouter = require('./makerChecker');
const changeLogsRouter = require('./changeLogs');
const metricsRouter = require('./metrics');
const usersRouter = require('./users');
const templatesRouter = require('./templates');
const tasksRouter = require('./tasks');
const aiRouter = require('./ai');
const vectorsRouter = require('./vectors');

// Mount all modular routes under /api
router.use('/', departmentsRouter);
router.use('/', policiesRouter);
router.use('/', makerCheckerRouter);
router.use('/', changeLogsRouter);
router.use('/', metricsRouter);
router.use('/', usersRouter);
router.use('/', templatesRouter);
router.use('/', tasksRouter);
router.use('/', aiRouter);
router.use('/', vectorsRouter);

// Base /api status route
router.get('/', (req, res) => {
  res.json({
    status: 'online',
    system: 'LibTrak OmniSpec Hub — Australian Banking Multi-Tenant API',
    version: '2.1.0',
    modules: [
      'departments',
      'policies',
      'maker-checker',
      'change-logs',
      'dashboard-metrics',
      'users',
      'templates',
      'ai-ingest',
      'ai-rag',
      'vectors'
    ]
  });
});

module.exports = router;

