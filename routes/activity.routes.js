const { Router } = require('express');
const {
    getDocumentActivity,
    getLibraryActivity,
    getUserActivity,
    getAllActivity,
} = require('../controllers/activity.controller');

const router = Router();

router.get('/document/:documentId', getDocumentActivity);
router.get('/library/:libraryId', getLibraryActivity);
router.get('/user/:userId', getUserActivity);
router.get('/', getAllActivity);

module.exports = router;
