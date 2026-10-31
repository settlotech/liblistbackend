const express = require('express');
const router = express.Router();
const multer = require('multer');
const { ingestDocuments, ragQuery } = require('../controllers/aiController');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }
});

// POST /api/ai/ingest-documents
router.post('/ai/ingest-documents', upload.array('files', 10), ingestDocuments);

// POST /api/ai/rag-query
router.post('/ai/rag-query', ragQuery);

module.exports = router;

