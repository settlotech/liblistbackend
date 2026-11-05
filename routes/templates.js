const express = require('express');
const router = express.Router();
const {
  getTemplates,
  getTemplateById,
  createTemplate
} = require('../controllers/templatesController');
const authenticate = require('../middleware/auth.middleware');
const { checkPermission } = require('../middleware/role.middleware');

 
router.use(authenticate); 
router.get('/templates', checkPermission('templates', 'read'), getTemplates);
 
router.get('/templates/:id', checkPermission('templates', 'read'), getTemplateById);
 
router.post('/templates', checkPermission('templates', 'create'), createTemplate);

module.exports = router;
