const { query } = require('../config/db');
(async () => {
  try {
    // Add label, color, and version_id if not present
    await query(`
      ALTER TABLE document_management.document_annotations
        ADD COLUMN IF NOT EXISTS label VARCHAR(100),
        ADD COLUMN IF NOT EXISTS color VARCHAR(30) DEFAULT '#0057B8',
        ADD COLUMN IF NOT EXISTS version_id UUID REFERENCES document_management.document_versions(id) ON DELETE SET NULL;
    `);
    console.log('✔ Added label, color, version_id to document_annotations');
  } catch (err) {
    console.error('Migration error:', err);
  } finally {
    process.exit(0);
  }
})();
