const { Router } = require('express');
const {
    createLibrary,
    getLibraryById,
    getAllLibraries,
    updateLibrary,
    deleteLibrary,
    getLibraryHierarchy,
    moveLibrary,
    requestLibraryRemoval,
    reviewLibraryRemoval,
    getPendingLibraryRemovals,
} = require('../controllers/library.controller');
const authenticate = require('../middleware/auth.middleware');
const validate = require('../middleware/validate.middleware');
const {
    createLibrarySchema,
    updateLibrarySchema,
    moveLibrarySchema,
    libraryQuerySchema,
    uuidParamSchema,
} = require('../validators/library.validator');

const router = Router();

// Static routes FIRST before /:id parameter matching
router.post('/', authenticate, validate(createLibrarySchema, 'body'), createLibrary);
router.get('/', authenticate, validate(libraryQuerySchema, 'query'), getAllLibraries);
router.get('/hierarchy', authenticate, getLibraryHierarchy);
router.get('/pending-removals', authenticate, getPendingLibraryRemovals);
router.get('/:id/hierarchy', authenticate, validate(uuidParamSchema, 'params'), getLibraryHierarchy);

// Parameterized routes SECOND
router.get('/:id', authenticate, validate(uuidParamSchema, 'params'), getLibraryById);
router.post('/:id/request-removal', authenticate, validate(uuidParamSchema, 'params'), requestLibraryRemoval);
router.patch('/:id/review-removal', authenticate, validate(uuidParamSchema, 'params'), reviewLibraryRemoval);
router.put('/:id', authenticate, validate(uuidParamSchema, 'params'), validate(updateLibrarySchema, 'body'), updateLibrary);
router.delete('/:id', authenticate, validate(uuidParamSchema, 'params'), deleteLibrary);
router.patch('/:id/move', authenticate, validate(uuidParamSchema, 'params'), validate(moveLibrarySchema, 'body'), moveLibrary);

module.exports = router;
