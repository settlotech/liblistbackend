const { query } = require('../config/db');
(async () => {
  const assets = await query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_schema = 'document_management' AND table_name = 'document_assets'
  `);
  console.log('document_assets columns:', assets.rows);

  const annot = await query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'document_management' AND table_name LIKE '%annot%'
  `);
  console.log('annotation tables:', annot.rows);

  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
