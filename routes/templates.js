const express = require('express');
const router = express.Router();
const {
  getTemplates,
  getTemplateById,
  createTemplate
} = require('../controllers/templatesController');
const authenticate = require('../middleware/auth.middleware');

// Protect all template endpoints with JWT authentication (Common for all users)
router.use(authenticate); 
router.get('/templates', getTemplates);
router.get('/templates/:id', getTemplateById);
router.post('/templates', createTemplate);

module.exports = router;
