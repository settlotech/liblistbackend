const { query } = require('../config/db');
(async () => {
  try {
    await query(`
      ALTER TABLE document_management.document_annotations
        DROP CONSTRAINT IF EXISTS chk_annotation_category;
      
      ALTER TABLE document_management.document_annotations
        ADD CONSTRAINT chk_annotation_category CHECK (
          category IN (
            'NOTES', 'ACTION', 'CDE', 'REGULATORY', 'REVISION',
            'COMPLIANCE', 'RISK', 'AUDIT', 'GENERAL', 'EXCEPTION'
          )
        );
    `);
    console.log('✔ Updated chk_annotation_category constraint');
  } catch (err) {
    console.error('Migration error:', err);
  } finally {
    process.exit(0);
  }
})();
