const { Router } = require('express');
const {
    createAnnotation,
    getAnnotationById,
    getAnnotationsByDocument,
    getAnnotationsBySection,
    getAnnotationsByReferenceCode,
    updateAnnotation,
    deleteAnnotation,
} = require('../controllers/annotation.controller');
const authenticate = require('../middleware/dmsAuth.middleware');
const validate = require('../middleware/validate.middleware');
const {
    createAnnotationSchema,
    updateAnnotationSchema,
    annotationQuerySchema,
    uuidParamSchema,
    documentIdParamSchema,
    sectionIdParamSchema,
    referenceCodeParamSchema,
} = require('../validators/annotation.validator');

const router = Router();

router.post('/', authenticate, validate(createAnnotationSchema, 'body'), createAnnotation);
router.get('/document/:documentId', validate(documentIdParamSchema, 'params'), validate(annotationQuerySchema, 'query'), getAnnotationsByDocument);
router.get('/section/:sectionId', validate(sectionIdParamSchema, 'params'), getAnnotationsBySection);
router.get('/reference/:code', validate(referenceCodeParamSchema, 'params'), getAnnotationsByReferenceCode);
router.get('/:id', validate(uuidParamSchema, 'params'), getAnnotationById);
router.put('/:id', authenticate, validate(uuidParamSchema, 'params'), validate(updateAnnotationSchema, 'body'), updateAnnotation);
router.delete('/:id', authenticate, validate(uuidParamSchema, 'params'), deleteAnnotation);

module.exports = router;
