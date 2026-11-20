BEGIN;

ALTER TABLE document_management.documents
    ADD COLUMN IF NOT EXISTS department_approval_status VARCHAR(30) NOT NULL DEFAULT 'not_required',
    ADD COLUMN IF NOT EXISTS department_approved_by UUID NULL REFERENCES public.users(id),
    ADD COLUMN IF NOT EXISTS department_approved_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS approval_checklist JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS document_management.department_user_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    library_id UUID NOT NULL REFERENCES document_management.libraries(id) ON DELETE CASCADE,
    can_view BOOLEAN NOT NULL DEFAULT TRUE,
    can_edit BOOLEAN NOT NULL DEFAULT FALSE,
    can_delete BOOLEAN NOT NULL DEFAULT FALSE,
    granted_by UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_department_user_access UNIQUE (user_id, library_id)
);
CREATE INDEX IF NOT EXISTS idx_department_user_access_user
    ON document_management.department_user_access(user_id);

INSERT INTO public.roles (role_name, description, is_active)
VALUES ('Department admin', 'Department-scoped policy access and first-level policy review', TRUE)
ON CONFLICT (role_name) DO UPDATE SET is_active = TRUE;

COMMIT;
