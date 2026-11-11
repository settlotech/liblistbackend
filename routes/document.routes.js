const { Router } = require('express');
const {
    createDocument,
    getDocumentById,
    getAllDocuments,
    getDocumentsByLibrary,
    updateDocument,
    deleteDocument,
    moveDocument,
    searchDocuments,
    getDocumentMetadata,
} = require('../controllers/document.controller');
const authenticate = require('../middleware/dmsAuth.middleware');
const validate = require('../middleware/validate.middleware');
const {
    createDocumentSchema,
    updateDocumentSchema,
    moveDocumentSchema,
    documentQuerySchema,
    documentSearchSchema,
    uuidParamSchema,
    libraryIdParamSchema,
} = require('../validators/document.validator');

const router = Router();

router.get('/search', validate(documentSearchSchema, 'query'), searchDocuments);
router.post('/', authenticate, validate(createDocumentSchema, 'body'), createDocument);
router.get('/', validate(documentQuerySchema, 'query'), getAllDocuments);
router.get('/library/:libraryId', validate(libraryIdParamSchema, 'params'), validate(documentQuerySchema, 'query'), getDocumentsByLibrary);
router.get('/:id/metadata', validate(uuidParamSchema, 'params'), getDocumentMetadata);
router.get('/:id', validate(uuidParamSchema, 'params'), getDocumentById);
router.put('/:id', authenticate, validate(uuidParamSchema, 'params'), validate(updateDocumentSchema, 'body'), updateDocument);
router.delete('/:id', authenticate, validate(uuidParamSchema, 'params'), deleteDocument);
router.patch('/:id/move', authenticate, validate(uuidParamSchema, 'params'), validate(moveDocumentSchema, 'body'), moveDocument);

module.exports = router;
