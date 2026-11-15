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
    reviewDocument,
    getPolicyAccess,
    updatePolicyAccess,
    getUserPolicyAccessList,
    bulkUpdateUserPolicyAccess,
    createRevision,
    submitRevisionForReview,
    discardRevision,
    saveSectionEdits,
    getVersionHistory,
    getVersionSections,
    requestPolicyRemoval,
    reviewPolicyRemoval,
    getPendingPolicyRemovals,
    getPinnedDocuments,
    pinDocument,
    unpinDocument,
    getDocumentPinStatus,
    extractAndFormatPolicyWithAI,
} = require('../controllers/document.controller');
const authenticate = require('../middleware/auth.middleware');
const validate = require('../middleware/validate.middleware');
const { checkPermission } = require('../middleware/role.middleware');
const multer = require('multer');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 40 * 1024 * 1024 }, // 40MB limit
});
const {
    getMyAnnotations,
    getAnnotations,
    createAnnotation,
    updateAnnotation,
    deleteAnnotation,
} = require('../controllers/annotation.controller');
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
router.post('/', authenticate, createDocument);
router.get('/', authenticate, validate(documentQuerySchema, 'query'), getAllDocuments);
router.get('/library/:libraryId', validate(libraryIdParamSchema, 'params'), validate(documentQuerySchema, 'query'), getDocumentsByLibrary);

// User-Centric Policy Access Controls — MUST be before /:id to avoid "user-access" being treated as an id
router.get('/user-access/:userId', authenticate, checkPermission('policy_access', 'read'), getUserPolicyAccessList);
router.put('/user-access/:userId', authenticate, checkPermission('policy_access', 'update'), bulkUpdateUserPolicyAccess);

// Policy Removal Workflow — before /:id to avoid route conflicts
router.get('/pending-removals', authenticate, getPendingPolicyRemovals);

// Personal Workspace: My Annotations and Notes across all policies — MUST be before /:id
router.get('/my-annotations', authenticate, getMyAnnotations);

// Pinned Policies for authenticated user — MUST be before /:id
router.get('/pinned', authenticate, getPinnedDocuments);

// AI Document Extraction & Ingestion — MUST be before /:id
router.post('/ai-extract', authenticate, upload.single('file'), extractAndFormatPolicyWithAI);

// Version Control routes — before /:id to avoid route conflicts
router.post('/:id/create-revision', authenticate, validate(uuidParamSchema, 'params'), createRevision);
router.post('/:id/submit-revision', authenticate, validate(uuidParamSchema, 'params'), submitRevisionForReview);
router.post('/:id/discard-revision', authenticate, validate(uuidParamSchema, 'params'), discardRevision);
router.put('/:id/sections', authenticate, validate(uuidParamSchema, 'params'), saveSectionEdits);
router.get('/:id/versions', authenticate, validate(uuidParamSchema, 'params'), getVersionHistory);
router.get('/:id/versions/:versionId/sections', authenticate, getVersionSections);

router.get('/:id/metadata', authenticate, validate(uuidParamSchema, 'params'), getDocumentMetadata);
router.get('/:id', authenticate, validate(uuidParamSchema, 'params'), getDocumentById);
router.get('/:id/pin-status', authenticate, validate(uuidParamSchema, 'params'), getDocumentPinStatus);
router.post('/:id/pin', authenticate, validate(uuidParamSchema, 'params'), pinDocument);
router.delete('/:id/pin', authenticate, validate(uuidParamSchema, 'params'), unpinDocument);
router.put('/:id', authenticate, validate(uuidParamSchema, 'params'), validate(updateDocumentSchema, 'body'), updateDocument);
router.delete('/:id', authenticate, validate(uuidParamSchema, 'params'), deleteDocument);
router.patch('/:id/move', authenticate, validate(uuidParamSchema, 'params'), validate(moveDocumentSchema, 'body'), moveDocument);

// Review & Approval (Super Admin)
router.patch('/:id/approval', authenticate, validate(uuidParamSchema, 'params'), reviewDocument);

// Policy Removal Workflow (Maker-Checker)
router.post('/:id/request-removal', authenticate, validate(uuidParamSchema, 'params'), requestPolicyRemoval);
router.patch('/:id/review-removal', authenticate, validate(uuidParamSchema, 'params'), reviewPolicyRemoval);

// Annotations and Notes routes
router.get('/:id/annotations', authenticate, validate(uuidParamSchema, 'params'), getAnnotations);
router.post('/:id/annotations', authenticate, validate(uuidParamSchema, 'params'), createAnnotation);
router.put('/:id/annotations/:annotationId', authenticate, updateAnnotation);
router.delete('/:id/annotations/:annotationId', authenticate, deleteAnnotation);

// Policy-Specific User-Level Access Controls (Navbar -> Bank Users & Access)
router.get('/:id/access', authenticate, validate(uuidParamSchema, 'params'), checkPermission('policy_access', 'read'), getPolicyAccess);
router.put('/:id/access', authenticate, validate(uuidParamSchema, 'params'), checkPermission('policy_access', 'update'), updatePolicyAccess);

module.exports = router;
