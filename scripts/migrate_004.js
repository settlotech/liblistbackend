require('dotenv').config();
const { query } = require('../config/db');
(async () => {
  try {
    // 1. Drop old status constraint
    await query(`ALTER TABLE document_management.documents DROP CONSTRAINT IF EXISTS chk_document_status`);
    console.log('✔ Dropped old status constraint');

    // 2. Add new status constraint including 'suspended'
    await query(`
      ALTER TABLE document_management.documents
        ADD CONSTRAINT chk_document_status CHECK (
          status IN ('draft','pending','in_review','active','approved','rejected','archived','suspended')
        )
    `);
    console.log('✔ Added updated status constraint (includes suspended)');

    // 3. Add policy removal columns
    await query(`
      ALTER TABLE document_management.documents
        ADD COLUMN IF NOT EXISTS pending_removal         BOOLEAN     NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS removal_requested_by    UUID        REFERENCES public.users(id),
        ADD COLUMN IF NOT EXISTS removal_reason          TEXT,
        ADD COLUMN IF NOT EXISTS removal_requested_at    TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS removal_reviewed_by     UUID        REFERENCES public.users(id),
        ADD COLUMN IF NOT EXISTS removal_reviewed_at     TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS removal_review_feedback TEXT
    `);
    console.log('✔ Added removal tracking columns to documents');

    // 4. Add can_delete to policy_user_access
    await query(`
      ALTER TABLE document_management.policy_user_access
        ADD COLUMN IF NOT EXISTS can_delete BOOLEAN NOT NULL DEFAULT FALSE
    `);
    console.log('✔ Added can_delete column to policy_user_access');

    console.log('\n✅ Migration 004 complete.');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    process.exit(0);
  }
})();
