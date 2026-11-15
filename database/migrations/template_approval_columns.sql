 
ALTER TABLE document_management.document_templates
    ADD COLUMN IF NOT EXISTS template_id VARCHAR(50),
    ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'approved',
    ADD COLUMN IF NOT EXISTS requested_by UUID NULL,
    ADD COLUMN IF NOT EXISTS approved_by UUID NULL,
    ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS rejection_reason TEXT NULL;

-- Add constraint only if it doesn't already exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_template_status'
          AND conrelid = 'document_management.document_templates'::regclass
    ) THEN
        ALTER TABLE document_management.document_templates
            ADD CONSTRAINT chk_template_status
            CHECK (status IN ('draft', 'pending', 'approved', 'rejected'));
    END IF;
END $$;

-- Unique index on template_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_templates_template_id
    ON document_management.document_templates(template_id)
    WHERE template_id IS NOT NULL AND deleted_at IS NULL;

-- Index on status for fast filtering
CREATE INDEX IF NOT EXISTS idx_templates_status
    ON document_management.document_templates(status)
    WHERE deleted_at IS NULL AND is_active = TRUE;
