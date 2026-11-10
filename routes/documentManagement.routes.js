const { Router } = require('express');
const libraryRoutes = require('./library.routes');
const documentRoutes = require('./document.routes');
const sectionRoutes = require('./section.routes');
const assetRoutes = require('./asset.routes');
const versionRoutes = require('./version.routes');
const annotationRoutes = require('./annotation.routes');
const referenceRoutes = require('./reference.routes');
const activityRoutes = require('./activity.routes');
const templateRoutes = require('./template.routes');
const importRoutes = require('./import.routes');

const router = Router();

 
 
router.use('/libraries', libraryRoutes);
router.use('/documents', documentRoutes);
router.use('/sections', sectionRoutes);
router.use('/assets', assetRoutes);
router.use('/versions', versionRoutes);
router.use('/annotations', annotationRoutes);
router.use('/references', referenceRoutes);
router.use('/activity', activityRoutes);
router.use('/templates', templateRoutes);
router.use('/imports', importRoutes);
router.use('/import', importRoutes);

module.exports = router;
