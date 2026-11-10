
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS document_management;
--  TRUNCATE TABLE
--     document_management.document_version_changes,
--     document_management.document_version_sections,
--     document_management.document_section_versions,
--     document_management.document_versions,
--     document_management.document_annotations,
--     document_management.document_references,
--     document_management.document_assets,
--     document_management.document_activity_logs,
--     document_management.document_import_jobs,
--     document_management.document_sections,
--     document_management.documents,
--     document_management.libraries,
--     document_management.document_templates
-- CASCADE;

CREATE TABLE IF NOT EXISTS document_management.libraries (
    id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_library_id   UUID NULL REFERENCES document_management.libraries(id) ON DELETE RESTRICT,
    library_name  VARCHAR(255) NOT NULL,
    description  TEXT,
    display_order  INTEGER NOT NULL DEFAULT 0,
    status  VARCHAR(20) NOT NULL DEFAULT 'active',
    created_by  UUID NULL, 
    updated_by   UUID NULL, 
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at   TIMESTAMPTZ NULL,
    CONSTRAINT chk_library_not_own_parent CHECK (parent_library_id IS NULL OR parent_library_id <> id),
    CONSTRAINT chk_library_status CHECK (status IN ('active', 'archived'))
);

CREATE INDEX IF NOT EXISTS idx_libraries_parent_order ON document_management.libraries(parent_library_id, display_order) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_libraries_status  ON document_management.libraries(status) WHERE deleted_at IS NULL;


CREATE TABLE IF NOT EXISTS document_management.documents (
    id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    library_id  UUID NOT NULL REFERENCES document_management.libraries(id) ON DELETE RESTRICT,
    document_name   VARCHAR(500) NOT NULL,
    description  TEXT,
    document_type   VARCHAR(100),
    status   VARCHAR(20) NOT NULL DEFAULT 'draft',
    current_version_id  UUID NULL,
    source_type  VARCHAR(20) NOT NULL DEFAULT 'manual',
    original_file_name  VARCHAR(500),
    original_file_key   TEXT,
    original_mime_type  VARCHAR(150),
    original_file_size  BIGINT,
    created_by   UUID NULL,
    updated_by   UUID NULL, 
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at   TIMESTAMPTZ NULL,
    CONSTRAINT chk_document_status CHECK (status IN ('draft', 'active', 'archived')),
    CONSTRAINT chk_document_source_type CHECK (source_type IN ('manual', 'upload', 'template')),
    CONSTRAINT chk_document_file_size CHECK (original_file_size IS NULL OR original_file_size >= 0)
);

CREATE INDEX IF NOT EXISTS idx_documents_library_created 
    ON document_management.documents(library_id, created_at DESC) 
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_documents_status 
    ON document_management.documents(status) 
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_documents_name_search 
    ON document_management.documents USING GIN (to_tsvector('simple', document_name));


CREATE TABLE IF NOT EXISTS document_management.document_sections (
    id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id         UUID NOT NULL REFERENCES document_management.documents(id) ON DELETE CASCADE,
    parent_section_id   UUID NULL REFERENCES document_management.document_sections(id) ON DELETE RESTRICT,
    section_title       VARCHAR(500) NOT NULL,
    section_number      VARCHAR(100),
    section_order       INTEGER NOT NULL DEFAULT 0,
    content             JSONB NOT NULL DEFAULT '{"type":"doc","content":[]}'::jsonb,
    page_start          INTEGER NULL,
    page_end            INTEGER NULL,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    lock_version        INTEGER NOT NULL DEFAULT 1,
    created_by          UUID NULL, 
    updated_by          UUID NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ NULL,
    CONSTRAINT chk_section_not_own_parent CHECK (parent_section_id IS NULL OR parent_section_id <> id),
    CONSTRAINT chk_section_lock_version CHECK (lock_version >= 1),
    CONSTRAINT chk_section_page_range
        CHECK ((page_start IS NULL AND page_end IS NULL)
            OR (page_start IS NOT NULL AND page_start > 0
            AND (page_end IS NULL OR page_end >= page_start))
        ),
    CONSTRAINT chk_section_content_object CHECK (jsonb_typeof(content) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_sections_document_parent_order
    ON document_management.document_sections(document_id, parent_section_id, section_order)
    WHERE deleted_at IS NULL AND is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_sections_parent
    ON document_management.document_sections(parent_section_id);

CREATE INDEX IF NOT EXISTS idx_sections_content
    ON document_management.document_sections USING GIN (content);


CREATE TABLE IF NOT EXISTS document_management.document_assets (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id         UUID NOT NULL REFERENCES document_management.documents(id) ON DELETE CASCADE,
    section_id          UUID NULL REFERENCES document_management.document_sections(id) ON DELETE SET NULL,
    file_name           VARCHAR(500) NOT NULL,
    storage_key         TEXT NOT NULL UNIQUE,
    mime_type           VARCHAR(150) NOT NULL,
    file_size           BIGINT NOT NULL,
    file_hash           VARCHAR(64),
    width               INTEGER NULL,
    height              INTEGER NULL,
    uploaded_by         UUID NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ NULL,
    CONSTRAINT chk_asset_file_size CHECK (file_size >= 0),
    CONSTRAINT chk_asset_dimensions
        CHECK (
            (width IS NULL OR width > 0)
            AND (height IS NULL OR height > 0)
        ),
    CONSTRAINT chk_asset_hash
        CHECK (file_hash IS NULL OR file_hash ~ '^[0-9a-f]{64}$')
);

CREATE INDEX IF NOT EXISTS idx_assets_document_section
    ON document_management.document_assets(document_id, section_id)
    WHERE deleted_at IS NULL;


CREATE TABLE IF NOT EXISTS document_management.document_versions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id         UUID NOT NULL REFERENCES document_management.documents(id) ON DELETE CASCADE,
    parent_version_id   UUID NULL REFERENCES document_management.document_versions(id) ON DELETE RESTRICT,
    version_number      INTEGER NOT NULL DEFAULT 1,
    version_tag         VARCHAR(50) NULL,
    commit_hash         VARCHAR(64) NOT NULL,
    commit_message      TEXT NOT NULL,
    committed_by        UUID NULL,
    committed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_document_version_number UNIQUE (document_id, version_number),
    CONSTRAINT uq_document_commit_hash UNIQUE (document_id, commit_hash),
    CONSTRAINT chk_version_number CHECK (version_number >= 1),
    CONSTRAINT chk_commit_hash CHECK (commit_hash ~ '^[0-9a-f]{64}$')
);

CREATE INDEX IF NOT EXISTS idx_document_versions_doc_num 
    ON document_management.document_versions(document_id, version_number DESC);

CREATE INDEX IF NOT EXISTS idx_document_versions_hash 
    ON document_management.document_versions(commit_hash);

-- Link document current_version_id foreign key 
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_documents_current_version' 
        AND table_schema = 'document_management'
    ) THEN
        ALTER TABLE document_management.documents 
        ADD CONSTRAINT fk_documents_current_version 
        FOREIGN KEY (current_version_id) 
        REFERENCES document_management.document_versions(id) 
        ON DELETE SET NULL;
    END IF;
END $$;


CREATE TABLE IF NOT EXISTS document_management.document_section_versions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    section_id          UUID NOT NULL REFERENCES document_management.document_sections(id) ON DELETE RESTRICT,
    section_title       VARCHAR(500) NOT NULL,
    content             JSONB NOT NULL,
    annotations_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
    content_hash        VARCHAR(64) NOT NULL,
    created_by          UUID NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_section_content_snapshot UNIQUE (section_id, content_hash),
    CONSTRAINT chk_section_version_hash CHECK (content_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT chk_snapshot_content_object CHECK (jsonb_typeof(content) = 'object'),
    CONSTRAINT chk_annotations_snapshot_array CHECK (jsonb_typeof(annotations_snapshot) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_section_versions_section
    ON document_management.document_section_versions(section_id, created_at DESC);


CREATE TABLE IF NOT EXISTS document_management.document_version_sections (
    document_version_id UUID NOT NULL REFERENCES document_management.document_versions(id) ON DELETE RESTRICT,
    section_id          UUID NOT NULL REFERENCES document_management.document_sections(id) ON DELETE RESTRICT,
    section_version_id  UUID NOT NULL REFERENCES document_management.document_section_versions(id) ON DELETE RESTRICT,
    parent_section_id   UUID NULL,
    section_order       INTEGER NOT NULL DEFAULT 0,
    section_number      VARCHAR(100),
    PRIMARY KEY (document_version_id, section_id)
);

CREATE INDEX IF NOT EXISTS idx_version_sections_snapshot
    ON document_management.document_version_sections(section_version_id);

CREATE INDEX IF NOT EXISTS idx_version_sections_parent
    ON document_management.document_version_sections(document_version_id, parent_section_id, section_order);


CREATE TABLE IF NOT EXISTS document_management.document_version_changes (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_version_id     UUID NOT NULL REFERENCES document_management.document_versions(id) ON DELETE RESTRICT,
    section_id              UUID NOT NULL REFERENCES document_management.document_sections(id) ON DELETE RESTRICT,
    change_type             VARCHAR(20) NOT NULL,
    old_section_version_id  UUID NULL REFERENCES document_management.document_section_versions(id) ON DELETE RESTRICT,
    new_section_version_id  UUID NULL REFERENCES document_management.document_section_versions(id) ON DELETE RESTRICT,
    change_summary          TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_version_change_type
        CHECK (change_type IN ('ADDED', 'UPDATED', 'DELETED', 'MOVED')),
    CONSTRAINT chk_version_change_snapshot_pair
        CHECK (
            (change_type = 'ADDED'
             AND old_section_version_id IS NULL
             AND new_section_version_id IS NOT NULL)
            OR
            (change_type = 'UPDATED'
             AND old_section_version_id IS NOT NULL
             AND new_section_version_id IS NOT NULL)
            OR
            (change_type = 'DELETED'
             AND old_section_version_id IS NOT NULL
             AND new_section_version_id IS NULL)
            OR
            (change_type = 'MOVED'
             AND old_section_version_id IS NOT NULL
             AND new_section_version_id IS NOT NULL)
        )
);

CREATE INDEX IF NOT EXISTS idx_version_changes_version
    ON document_management.document_version_changes(document_version_id);

CREATE INDEX IF NOT EXISTS idx_version_changes_section
    ON document_management.document_version_changes(section_id);


CREATE TABLE IF NOT EXISTS document_management.document_annotations (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id         UUID NOT NULL REFERENCES document_management.documents(id) ON DELETE CASCADE,
    section_id          UUID NULL REFERENCES document_management.document_sections(id) ON DELETE CASCADE,
    asset_id            UUID NULL REFERENCES document_management.document_assets(id) ON DELETE SET NULL,
    annotation_type     VARCHAR(20) NOT NULL,
    category            VARCHAR(20) NOT NULL DEFAULT 'NOTES',
    anchor_data         JSONB NOT NULL DEFAULT '{}'::jsonb,
    annotation_text     TEXT NOT NULL,
    reference_code      VARCHAR(100) NULL,
    status              VARCHAR(20) NOT NULL DEFAULT 'open',
    created_by          UUID NULL,
    updated_by          UUID NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ NULL,
    CONSTRAINT chk_annotation_type CHECK (annotation_type IN ('TEXT', 'IMAGE')),
    CONSTRAINT chk_annotation_category CHECK (category IN ('NOTES', 'ACTION', 'CDE', 'REGULATORY', 'REVISION')),
    CONSTRAINT chk_annotation_status CHECK (status IN ('open', 'resolved', 'archived')),
    CONSTRAINT chk_annotation_anchor_object CHECK (jsonb_typeof(anchor_data) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_annotations_doc_sec
    ON document_management.document_annotations(document_id, section_id)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_annotations_asset
    ON document_management.document_annotations(asset_id)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_annotations_reference_code
    ON document_management.document_annotations(reference_code)
    WHERE deleted_at IS NULL;


CREATE TABLE IF NOT EXISTS document_management.document_references (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id         UUID NOT NULL REFERENCES document_management.documents(id) ON DELETE CASCADE,
    reference_code      VARCHAR(100) NOT NULL,
    title               VARCHAR(500) NOT NULL,
    description         TEXT,
    reference_type      VARCHAR(50) NOT NULL DEFAULT 'general',
    target_url          TEXT,
    metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by          UUID NULL,
    updated_by          UUID NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ NULL,
    CONSTRAINT uq_doc_reference_code UNIQUE (document_id, reference_code),
    CONSTRAINT chk_reference_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_references_doc_code
    ON document_management.document_references(document_id, reference_code)
    WHERE deleted_at IS NULL;


CREATE TABLE IF NOT EXISTS document_management.document_activity_logs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id         UUID NULL REFERENCES document_management.documents(id) ON DELETE CASCADE,
    library_id          UUID NULL REFERENCES document_management.libraries(id) ON DELETE SET NULL,
    section_id          UUID NULL,
    event_type          VARCHAR(100) NOT NULL,
    entity_type         VARCHAR(50) NOT NULL,
    entity_id           UUID NOT NULL,
    details             JSONB NOT NULL DEFAULT '{}'::jsonb,
    actor_id            UUID NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_activity_details_object CHECK (jsonb_typeof(details) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_doc 
    ON document_management.document_activity_logs(document_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_logs_lib 
    ON document_management.document_activity_logs(library_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_logs_actor 
    ON document_management.document_activity_logs(actor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_logs_event 
    ON document_management.document_activity_logs(event_type, created_at DESC);


CREATE TABLE IF NOT EXISTS document_management.document_templates (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_name       VARCHAR(255) NOT NULL,
    description         TEXT,
    category            VARCHAR(100) NOT NULL DEFAULT 'General',
    structure           JSONB NOT NULL DEFAULT '{"sections":[]}'::jsonb,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_by          UUID NULL,
    updated_by          UUID NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ NULL,
    CONSTRAINT chk_template_structure_object CHECK (jsonb_typeof(structure) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_templates_category 
    ON document_management.document_templates(category) 
    WHERE deleted_at IS NULL AND is_active = TRUE;


CREATE TABLE IF NOT EXISTS document_management.document_import_jobs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id         UUID NULL REFERENCES document_management.documents(id) ON DELETE SET NULL,
    source_file_name    VARCHAR(500) NOT NULL,
    source_storage_key  TEXT NOT NULL,
    source_mime_type    VARCHAR(150),
    source_file_size    BIGINT,
    status              VARCHAR(30) NOT NULL DEFAULT 'queued',
    processing_stage    VARCHAR(100),
    progress_percent    SMALLINT NOT NULL DEFAULT 0,
    extracted_structure JSONB,
    error_message       TEXT,
    requested_by        UUID NULL,
    started_at          TIMESTAMPTZ NULL,
    completed_at        TIMESTAMPTZ NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_import_status 
        CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'cancelled')),
    CONSTRAINT chk_import_progress 
        CHECK (progress_percent BETWEEN 0 AND 100),
    CONSTRAINT chk_import_file_size 
        CHECK (source_file_size IS NULL OR source_file_size >= 0)
);

CREATE INDEX IF NOT EXISTS idx_import_jobs_queue
    ON document_management.document_import_jobs(status, created_at)
    WHERE status IN ('queued', 'processing');

CREATE INDEX IF NOT EXISTS idx_import_jobs_document
    ON document_management.document_import_jobs(document_id, created_at DESC);

COMMIT;
