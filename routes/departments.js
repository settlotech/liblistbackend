const express = require('express');
const router = express.Router();
const { getHierarchy, createDepartment } = require('../controllers/departmentController');
const { roleGuard } = require('../middleware/roleGuard');

// GET /api/hierarchy
router.get('/hierarchy', getHierarchy);

// POST /api/departments (Manager or Admin only)
router.post('/departments', roleGuard(['manager', 'admin']), createDepartment);

module.exports = router;

