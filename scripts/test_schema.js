require('dotenv').config();
const { query } = require('../config/db');
(async () => {
  try {
    const pua = await query(`
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns 
      WHERE table_schema = 'document_management' AND table_name = 'policy_user_access'
    `);
    console.log('policy_user_access columns:', pua.rows);

    const docs = await query(`
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns 
      WHERE table_schema = 'document_management' AND table_name = 'documents'
    `);
    console.log('documents columns:', docs.rows.map(r => r.column_name));

    const checkConstraints = await query(`
      SELECT conname, pg_get_constraintdef(c.oid)
      FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE conrelid = 'document_management.documents'::regclass;
    `);
    console.log('documents constraints:', checkConstraints.rows);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    process.exit(0);
  }
})();
