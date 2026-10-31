const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const { requestLogger } = require('./middleware/requestLogger');
const { errorHandler } = require('./middleware/errorHandler');
const apiRoutes = require('./routes/index');
const { get3dViewerHtml } = require('./views/viewerHtml');

const app = express();
const PORT = process.env.PORT || 5000;

// Security & Body Parsers
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Request Logging Middleware
app.use(requestLogger);

// Root landing endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'LibTrak OmniSpec Hub API',
    version: '2.1.0',
    documentation: '/api',
    endpoints: {
      hierarchy: '/api/hierarchy',
      policies: '/api/policies',
      maker_checker: '/api/maker-checker',
      change_logs: '/api/change-logs',
      metrics: '/api/dashboard-metrics',
      users: '/api/users',
      templates: '/api/templates',
      ingest: '/api/ai/ingest-documents',
      rag: '/api/ai/rag-query',
      vectors: '/api/vectors',
      viewer_3d: '/3dviewer'
    }
  });
});

// Standalone 3D Vector DB Viewer & TensorFlow Projector
app.get('/3dviewer', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(get3dViewerHtml());
});

// Mount all modular API routes under /api
app.use('/api', apiRoutes);

// Global Error Handler Middleware
app.use(errorHandler);

// Export app for Vercel Serverless Function deployment
module.exports = app;

// Start Server locally
if (process.env.VERCEL !== '1' && !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`🚀 LibTrak Modular Backend running on port ${PORT}`);
    console.log(`📡 API available at http://localhost:${PORT}/api`);
    console.log(`🌐 3D Projector Viewer at http://localhost:${PORT}/3dviewer`);
  });
}
