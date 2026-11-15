const express = require('express');
const router = express.Router();
const settingController = require('../controllers/setting.controller');
const authenticate = require('../middleware/auth.middleware');

router.use(authenticate);

router.get('/', settingController.getSettings);
router.put('/', settingController.updateSettings);

module.exports = router;
