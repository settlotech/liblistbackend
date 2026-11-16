const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/auth.middleware');
const {
    listNotes,
    createNote,
    updateNote,
    removeNote,
} = require('../controllers/userNote.controller');

router.use(authenticate);

router.get('/user-notes', listNotes);
router.post('/user-notes', createNote);
router.put('/user-notes/:id', updateNote);
router.patch('/user-notes/:id', updateNote);
router.delete('/user-notes/:id', removeNote);

module.exports = router;
