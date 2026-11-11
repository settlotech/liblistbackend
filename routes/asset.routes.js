const { Router } = require('express');
const fs = require('fs');
const path = require('path');
const {
    uploadImageAsset,
    uploadDocumentAttachment,
    getAssetDetails,
    getAssetsByDocument,
    deleteAsset,
    updateAssetMetadata,
} = require('../controllers/asset.controller');
const authenticate = require('../middleware/dmsAuth.middleware');
const {
    uploadImageMiddleware,
    uploadAttachmentMiddleware,
} = require('../middleware/upload.middleware');

const router = Router();

// Stream file by storage key (Express 5 safe wildcard)
router.get('/file', (req, res) => {
    try {
        const key = req.query.key;
        if (!key) return res.status(400).json({ success: false, message: 'Missing key parameter' });
        const filePath = path.join(__dirname, '..', 'uploads', key);
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, message: 'File not found' });
        }
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        res.setHeader('Access-Control-Allow-Origin', '*');
        return res.sendFile(filePath);
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Error loading asset' });
    }
});

// Upload endpoints (support both /upload/image and /document/:documentId/upload-image)
router.post('/document/:documentId/upload-image', authenticate, uploadImageMiddleware, uploadImageAsset);
router.post('/:documentId/upload-image', authenticate, uploadImageMiddleware, uploadImageAsset);
router.post('/upload/image', authenticate, uploadImageMiddleware, uploadImageAsset);

router.post('/document/:documentId/upload-attachment', authenticate, uploadAttachmentMiddleware, uploadDocumentAttachment);
router.post('/:documentId/upload-attachment', authenticate, uploadAttachmentMiddleware, uploadDocumentAttachment);
router.post('/upload/attachment', authenticate, uploadAttachmentMiddleware, uploadDocumentAttachment);
router.get('/document/:documentId', getAssetsByDocument);
router.get('/:id', getAssetDetails);
router.patch('/:id/metadata', authenticate, updateAssetMetadata);
router.delete('/:id', authenticate, deleteAsset);

module.exports = router;
