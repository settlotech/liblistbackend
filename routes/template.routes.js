const { Router } = require('express');
const {
    createTemplate,
    getTemplateById,
    getAllTemplates,
    updateTemplate,
    deleteTemplate,
    createDocumentFromTemplate,
} = require('../controllers/template.controller');
const authenticate = require('../middleware/dmsAuth.middleware');
const validate = require('../middleware/validate.middleware');
const {
    createTemplateSchema,
    instantiateDocumentFromTemplateSchema,
    uuidParamSchema,
} = require('../validators/template.validator');

const router = Router();

router.post('/', authenticate, validate(createTemplateSchema, 'body'), createTemplate);
router.get('/', getAllTemplates);
router.get('/:id', validate(uuidParamSchema, 'params'), getTemplateById);
router.put('/:id', authenticate, validate(uuidParamSchema, 'params'), updateTemplate);
router.delete('/:id', authenticate, validate(uuidParamSchema, 'params'), deleteTemplate);
router.post(
    '/:id/create-document',
    authenticate,
    validate(uuidParamSchema, 'params'),
    validate(instantiateDocumentFromTemplateSchema, 'body'),
    createDocumentFromTemplate
);

module.exports = router;
