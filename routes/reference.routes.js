const { Router } = require('express');
const {
    createReference,
    getReferenceById,
    getReferencesByDocument,
    generateReferenceCode,
    updateReference,
    deleteReference,
} = require('../controllers/reference.controller');
const authenticate = require('../middleware/dmsAuth.middleware');

const router = Router();

router.post('/document/:documentId/generate-code', authenticate, generateReferenceCode);
router.get('/document/:documentId', getReferencesByDocument);
router.post('/', authenticate, createReference);
router.get('/:id', getReferenceById);
router.put('/:id', authenticate, updateReference);
router.delete('/:id', authenticate, deleteReference);

module.exports = router;
