-- Migration 004: Policy Removal Workflow + can_delete permission flag
-- Run ONCE against the live database.

-- 1. Update status check constraint to allow 'suspended'
ALTER TABLE document_management.documents
    DROP CONSTRAINT IF EXISTS chk_document_status;

ALTER TABLE document_management.documents
    ADD CONSTRAINT chk_document_status CHECK (
        status IN ('draft','pending','in_review','active','approved','rejected','archived','suspended')
    );

-- 2. Add policy removal tracking columns to documents
ALTER TABLE document_management.documents
    ADD COLUMN IF NOT EXISTS pending_removal        BOOLEAN   NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS removal_requested_by   UUID      REFERENCES public.users(id),
    ADD COLUMN IF NOT EXISTS removal_reason         TEXT,
    ADD COLUMN IF NOT EXISTS removal_requested_at   TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS removal_reviewed_by    UUID      REFERENCES public.users(id),
    ADD COLUMN IF NOT EXISTS removal_reviewed_at    TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS removal_review_feedback TEXT;

-- 3. Add can_delete flag to policy_user_access
ALTER TABLE document_management.policy_user_access
    ADD COLUMN IF NOT EXISTS can_delete BOOLEAN NOT NULL DEFAULT FALSE;
