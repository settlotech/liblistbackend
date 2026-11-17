const { Router } = require('express');
const authenticate = require('../middleware/auth.middleware');
const controller = require('../controllers/policyChat.controller');

const router = Router();

router.get('/:documentId/chat', authenticate, controller.getPolicyChat);
router.post('/:documentId/chat', authenticate, controller.savePolicyMessage);
router.post('/:documentId/chat/ask', authenticate, controller.askShidney);

module.exports = router;
