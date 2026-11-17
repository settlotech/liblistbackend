const { Router } = require('express');
const authenticate = require('../middleware/auth.middleware');
const controller = require('../controllers/privateChat.controller');

const router = Router();

router.get('/', authenticate, controller.getChats);
router.get('/ai/messages', authenticate, controller.getAiMessages);
router.post('/ai/messages', authenticate, controller.sendAiMessage);
router.get('/direct/:userId/messages', authenticate, controller.getDirectMessages);
router.post('/direct/:userId/messages', authenticate, controller.sendDirectMessage);

module.exports = router;
