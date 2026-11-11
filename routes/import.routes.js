const { Router } = require('express');
const {
    startImportJob,
    getImportJobStatus,
    reviewExtractedContent,
    confirmExtractedDocument,
    retryImportJob,
    cancelImportJob,
} = require('../controllers/import.controller');
const authenticate = require('../middleware/dmsAuth.middleware');
const { uploadAttachmentMiddleware } = require('../middleware/upload.middleware');

const router = Router();

router.post('/upload', authenticate, uploadAttachmentMiddleware, startImportJob);
router.get('/:id/status', getImportJobStatus);
router.get('/:id/review', reviewExtractedContent);
router.post('/:id/confirm', authenticate, confirmExtractedDocument);
router.post('/:id/retry', authenticate, retryImportJob);
router.post('/:id/cancel', authenticate, cancelImportJob);

module.exports = router;
