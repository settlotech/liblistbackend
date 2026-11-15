const { query } = require('../config/db');
(async () => {
  const cons = await query(`
    SELECT conname, pg_get_constraintdef(c.oid)
    FROM pg_constraint c
    WHERE conrelid = 'document_management.document_annotations'::regclass;
  `);
  console.log('constraints:', cons.rows);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
