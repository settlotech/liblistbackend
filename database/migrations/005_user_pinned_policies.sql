-- Migration 005: User Pinned Policies
-- Allows users to pin/unpin individual policies to their sidebar PINNED LIBRARIES / POLICIES navigation.

CREATE TABLE IF NOT EXISTS document_management.user_pinned_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES document_management.documents(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_user_pinned_policy UNIQUE(user_id, document_id)
);

CREATE INDEX IF NOT EXISTS idx_user_pinned_policies_user ON document_management.user_pinned_policies(user_id);
CREATE INDEX IF NOT EXISTS idx_user_pinned_policies_doc ON document_management.user_pinned_policies(document_id);
