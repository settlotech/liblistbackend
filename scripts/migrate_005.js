require('dotenv').config();
const { query } = require('../config/db');

(async () => {
  try {
    console.log('Running Migration 005: User Pinned Policies...');
    await query(`
      CREATE TABLE IF NOT EXISTS document_management.user_pinned_policies (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
          document_id UUID NOT NULL REFERENCES document_management.documents(id) ON DELETE CASCADE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          CONSTRAINT uq_user_pinned_policy UNIQUE(user_id, document_id)
      );
    `);
    console.log('✔ Created document_management.user_pinned_policies table');

    await query(`
      CREATE INDEX IF NOT EXISTS idx_user_pinned_policies_user ON document_management.user_pinned_policies(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_pinned_policies_doc ON document_management.user_pinned_policies(document_id);
    `);
    console.log('✔ Created indexes on user_pinned_policies');

    console.log('\n✅ Migration 005 complete.');
  } catch (err) {
    console.error('Migration 005 failed:', err);
  } finally {
    process.exit(0);
  }
})();
