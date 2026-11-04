const express = require('express');
const router = express.Router();
const {
  getTemplates,
  getTemplateById,
  createTemplate
} = require('../controllers/templatesController');
const { roleGuard } = require('../middleware/roleGuard');

// GET /api/templates - List all dynamic policy starter templates
router.get('/templates', getTemplates);

// GET /api/templates/:id - Single template
router.get('/templates/:id', getTemplateById);

// POST /api/templates - Create dynamic template (Manager or Admin)
router.post('/templates', roleGuard(['manager', 'admin']), createTemplate);

module.exports = router;

