const express = require('express');
const router = express.Router();
const {
  getVectors,
  getVectorsTsv,
  getMetadataTsv,
  getProjectorConfig
} = require('../controllers/vectorController');

// GET /api/vectors
router.get('/vectors', getVectors);

// GET /api/projector/vectors.tsv
router.get('/projector/vectors.tsv', getVectorsTsv);

// GET /api/projector/metadata.tsv
router.get('/projector/metadata.tsv', getMetadataTsv);

// GET /api/projector/config.json
router.get('/projector/config.json', getProjectorConfig);

module.exports = router;

