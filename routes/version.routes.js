const { Router } = require('express');
const {
    commitDocumentChanges,
    getDocumentVersionHistory,
    getVersionById,
    getVersionManifest,
    getVersionChanges,
    compareTwoVersions,
    restoreOlderVersion,
} = require('../controllers/version.controller');
const authenticate = require('../middleware/dmsAuth.middleware');
const validate = require('../middleware/validate.middleware');
const {
    commitDocumentSchema,
    compareVersionsQuerySchema,
    restoreVersionSchema,
    uuidParamSchema,
    documentIdParamSchema,
    restoreParamsSchema,
} = require('../validators/version.validator');

const router = Router();

// 1. Commit endpoints (supports /commit, /:documentId/commit, and /document/:documentId/commit)
router.post('/commit', authenticate, validate(commitDocumentSchema, 'body'), commitDocumentChanges);
router.post('/:documentId/commit', authenticate, validate(documentIdParamSchema, 'params'), validate(commitDocumentSchema, 'body'), commitDocumentChanges);
router.post('/document/:documentId/commit', authenticate, validate(documentIdParamSchema, 'params'), validate(commitDocumentSchema, 'body'), commitDocumentChanges);

// 2. Comparison & History
router.get('/compare', validate(compareVersionsQuerySchema, 'query'), compareTwoVersions);
router.get('/document/:documentId', validate(documentIdParamSchema, 'params'), getDocumentVersionHistory);

// 3. Restore endpoints (Express 5 separate routes without ? syntax)
router.post('/document/:documentId/restore/:versionId', authenticate, validate(restoreParamsSchema, 'params'), validate(restoreVersionSchema, 'body'), restoreOlderVersion);
router.post('/document/:documentId/restore', authenticate, validate(restoreParamsSchema, 'params'), validate(restoreVersionSchema, 'body'), restoreOlderVersion);
router.post('/:documentId/restore/:versionId', authenticate, validate(restoreParamsSchema, 'params'), validate(restoreVersionSchema, 'body'), restoreOlderVersion);
router.post('/:documentId/restore', authenticate, validate(restoreParamsSchema, 'params'), validate(restoreVersionSchema, 'body'), restoreOlderVersion);

// 4. Manifest & Details by version ID
router.get('/:id/manifest', validate(uuidParamSchema, 'params'), getVersionManifest);
router.get('/:id/changes', validate(uuidParamSchema, 'params'), getVersionChanges);
router.get('/:id', validate(uuidParamSchema, 'params'), getVersionById);

module.exports = router;
