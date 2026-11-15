-- Migration: Add Document Approval & Policy User Access Controls

ALTER TABLE document_management.documents
    DROP CONSTRAINT IF EXISTS chk_document_status;

ALTER TABLE document_management.documents
    ADD CONSTRAINT chk_document_status
    CHECK (status IN ('draft', 'pending', 'in_review', 'active', 'approved', 'rejected', 'archived'));

ALTER TABLE document_management.documents
    ADD COLUMN IF NOT EXISTS requested_by UUID NULL REFERENCES public.users(id),
    ADD COLUMN IF NOT EXISTS approved_by UUID NULL REFERENCES public.users(id),
    ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS rejection_reason TEXT NULL;

CREATE TABLE IF NOT EXISTS document_management.policy_user_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES document_management.documents(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    can_view BOOLEAN NOT NULL DEFAULT TRUE,
    can_edit BOOLEAN NOT NULL DEFAULT FALSE,
    granted_by UUID NULL REFERENCES public.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_policy_user_access UNIQUE (document_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_policy_user_access_user 
    ON document_management.policy_user_access(user_id);

CREATE INDEX IF NOT EXISTS idx_policy_user_access_doc 
    ON document_management.policy_user_access(document_id);
