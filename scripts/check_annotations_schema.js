const { query } = require('../config/db');
(async () => {
  const annot = await query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns 
    WHERE table_schema = 'document_management' AND table_name = 'document_annotations'
  `);
  console.log('document_annotations columns:', annot.rows);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
