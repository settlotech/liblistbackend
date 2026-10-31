const express = require('express');
const router = express.Router();
const {
  getMakerCheckerItems,
  createMakerCheckerItem,
  actionMakerChecker,
  closeMakerCheckerItem
} = require('../controllers/makerCheckerController');

// GET /api/maker-checker
router.get('/maker-checker', getMakerCheckerItems);

// POST /api/maker-checker
router.post('/maker-checker', createMakerCheckerItem);

// POST /api/maker-checker/:id/action (approve / reject)
router.post('/maker-checker/:id/action', actionMakerChecker);

// PATCH /api/maker-checker/:id/close
router.patch('/maker-checker/:id/close', closeMakerCheckerItem);

module.exports = router;

