const { Router } = require('express');
const {
    getCategories,
    createTemplate,
    getAllTemplates,
    getTemplateById,
    updateTemplate,
    reviewTemplate,
    cloneTemplateToDocument,
    deleteTemplate,
} = require('../controllers/template.controller');
const authenticate = require('../middleware/auth.middleware');
const { checkPermission } = require('../middleware/role.middleware');
const validate = require('../middleware/validate.middleware');
const {
    createTemplateSchema,
    updateTemplateSchema,
    instantiateDocumentFromTemplateSchema,
    uuidParamSchema,
} = require('../validators/template.validator');

const router = Router();

// All template operations require authentication
router.use(authenticate);

// GET distinct categories for autocomplete (any authenticated user)
router.get('/categories', getCategories);

// List templates (read, approval, or create permissions; super admin bypass)
router.get('/', (req, res, next) => {
    if (req.user?.isSuperAdmin) return getAllTemplates(req, res, next);
    const userPerms = (req.user?.permissionStrings || []).map(p => p.toLowerCase());
    const hasAnyAccess = ['templates:read', 'templates:approval', 'templates:create'].some(p => userPerms.includes(p));
    if (hasAnyAccess) {
        return getAllTemplates(req, res, next);
    }
    return checkPermission('templates', 'read')(req, res, next);
});

// Get single template
router.get('/:id', validate(uuidParamSchema, 'params'), (req, res, next) => {
    if (req.user?.isSuperAdmin) return getTemplateById(req, res, next);
    const userPerms = (req.user?.permissionStrings || []).map(p => p.toLowerCase());
    const hasAnyAccess = ['templates:read', 'templates:approval', 'templates:create'].some(p => userPerms.includes(p));
    if (hasAnyAccess) {
        return getTemplateById(req, res, next);
    }
    return checkPermission('templates', 'read')(req, res, next);
});

// Create new template (create permission: Super Admin creates approved, others submit for approval)
router.post(
    '/',
    checkPermission('templates', 'create'),
    validate(createTemplateSchema, 'body'),
    createTemplate
);

// Update existing template (update permission - Super Admin / Admin / Roles with templates:update)
router.put(
    '/:id',
    validate(uuidParamSchema, 'params'),
    checkPermission('templates', 'update'),
    validate(updateTemplateSchema, 'body'),
    updateTemplate
);

// Clone template into a new policy document (requires document create permission)
router.post(
    '/:id/clone',
    validate(uuidParamSchema, 'params'),
    validate(instantiateDocumentFromTemplateSchema, 'body'),
    cloneTemplateToDocument
);

// Review & Approve/Reject template (requires templates:approval permission)
router.patch(
    '/:id/approval',
    validate(uuidParamSchema, 'params'),
    checkPermission('templates', 'approval'),
    reviewTemplate
);

// Delete template (delete permission)
router.delete(
    '/:id',
    validate(uuidParamSchema, 'params'),
    checkPermission('templates', 'delete'),
    deleteTemplate
);

module.exports = router;
