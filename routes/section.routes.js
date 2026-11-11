const { Router } = require('express');
const {
    createSection,
    createSubSection,
    getAllSectionsOfDocument,
    getSectionById,
    updateSection,
    updateSectionContent,
    saveSectionDraft,
    moveSection,
    reorderSections,
    getSectionHierarchy,
    deleteSection,
} = require('../controllers/section.controller');
const authenticate = require('../middleware/dmsAuth.middleware');
const validate = require('../middleware/validate.middleware');
const {
    createSectionSchema,
    createSubSectionSchema,
    updateSectionMetadataSchema,
    updateSectionContentSchema,
    moveSectionSchema,
    reorderSectionsSchema,
    sectionQuerySchema,
    uuidParamSchema,
    documentIdParamSchema,
} = require('../validators/section.validator');

const router = Router();

router.post('/reorder', authenticate, validate(reorderSectionsSchema, 'body'), reorderSections);
router.get('/document/:documentId', validate(documentIdParamSchema, 'params'), validate(sectionQuerySchema, 'query'), getAllSectionsOfDocument);
router.post('/subsection', authenticate, validate(createSubSectionSchema, 'body'), createSubSection);
router.post('/', authenticate, validate(createSectionSchema, 'body'), createSection);
router.get('/:id/hierarchy', validate(uuidParamSchema, 'params'), getSectionHierarchy);
router.patch('/:id/content', authenticate, validate(uuidParamSchema, 'params'), validate(updateSectionContentSchema, 'body'), updateSectionContent);
router.post('/:id/draft', authenticate, validate(uuidParamSchema, 'params'), validate(updateSectionContentSchema, 'body'), saveSectionDraft);
router.patch('/:id/move', authenticate, validate(uuidParamSchema, 'params'), validate(moveSectionSchema, 'body'), moveSection);
router.get('/:id', validate(uuidParamSchema, 'params'), getSectionById);
router.put('/:id', authenticate, validate(uuidParamSchema, 'params'), validate(updateSectionMetadataSchema, 'body'), updateSection);
router.delete('/:id', authenticate, validate(uuidParamSchema, 'params'), deleteSection);

module.exports = router;
