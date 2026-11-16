-- =============================================================================
-- LibList —  
-- =============================================================================
-- Run this ONCE on a brand-new PostgreSQL database to bring it to the latest
-- state.  Every statement is idempotent (IF NOT EXISTS / ON CONFLICT DO …)
-- so it is safe to re-run if something failed mid-way.
--
-- Execution order:
--   1. Extensions
--   2. Public schema  – core RBAC tables
--   3. Task management tables (public schema)
--   4. document_management schema – library / document / task tables
--   5. All historical migration changes (002 → 005 + template_approval) MERGED IN
--   6. Reference / seed data  (roles, modules, operations, permissions)
--   7. Super-admin user is seeded at runtime by:  node database/initDatabase.js
--
-- Usage:
--   psql -U <db_user> -d <db_name> -f 000_complete_schema.sql
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- EXTENSIONS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()

-- ─────────────────────────────────────────────────────────────────────────────
-- SCHEMA
-- ─────────────────────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS document_management;

-- =============================================================================
-- SECTION 1 : PUBLIC SCHEMA — Core RBAC & Auth Tables
-- =============================================================================

-- ── Users ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.users (
    id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(100)  NOT NULL,
    email           VARCHAR(255)  NOT NULL UNIQUE,
    password        VARCHAR(255)  NOT NULL,
    is_active       BOOLEAN       DEFAULT TRUE,
    token_version   INTEGER       NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ   DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   DEFAULT NOW()
);

-- ── Roles ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.roles (
    id          SERIAL       PRIMARY KEY,
    role_name   VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    is_active   BOOLEAN      DEFAULT TRUE,
    created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

-- ── Modules (e.g. users, roles, documents) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.modules (
    id           SERIAL       PRIMARY KEY,
    module_name  VARCHAR(100) UNIQUE NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    is_active    BOOLEAN      DEFAULT TRUE
);

-- ── Operations (create, read, update, delete, export, import, approval) ──────
CREATE TABLE IF NOT EXISTS public.operations (
    id              SERIAL      PRIMARY KEY,
    operation_name  VARCHAR(50) UNIQUE NOT NULL,
    display_name    VARCHAR(50) NOT NULL
);

-- ── User ↔ Role mapping ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_roles (
    id          SERIAL    PRIMARY KEY,
    user_id     UUID      NOT NULL REFERENCES public.users(id)  ON DELETE CASCADE,
    role_id     INTEGER   NOT NULL REFERENCES public.roles(id)  ON DELETE CASCADE,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, role_id)
);

-- ── Role ↔ Module ↔ Operation permissions ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.role_permissions (
    id           SERIAL  PRIMARY KEY,
    role_id      INTEGER NOT NULL REFERENCES public.roles(id)      ON DELETE CASCADE,
    module_id    INTEGER NOT NULL REFERENCES public.modules(id)    ON DELETE CASCADE,
    operation_id INTEGER NOT NULL REFERENCES public.operations(id) ON DELETE CASCADE,
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (role_id, module_id, operation_id)
);

-- ── Refresh Tokens ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.refresh_tokens (
    id                UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID     NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    token_hash        CHAR(64) NOT NULL UNIQUE,
    family_id         UUID     NOT NULL,
    expires_at        TIMESTAMPTZ NOT NULL,
    revoked_at        TIMESTAMPTZ,
    replaced_by_hash  CHAR(64),
    created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ── User Settings (theme / button colour) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_settings (
    id            SERIAL      PRIMARY KEY,
    user_id       UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE UNIQUE,
    theme         VARCHAR(20) NOT NULL DEFAULT 'system',
    button_color  VARCHAR(30) NOT NULL DEFAULT '#075bb9',
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── Password Reset / OTP ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    otp        VARCHAR(10) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used       BOOLEAN     DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── User Onboarding / Access Requests ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_request (
    id                SERIAL       PRIMARY KEY,
    user_email        VARCHAR(255) NOT NULL,
    user_name         VARCHAR(100),
    otp_hash          VARCHAR(255),
    expires_at        TIMESTAMPTZ,
    is_email_verified BOOLEAN      DEFAULT FALSE,
    status            VARCHAR(50)  DEFAULT 'pending',
    is_used           BOOLEAN      DEFAULT FALSE,
    reviewed_by       UUID         REFERENCES public.users(id) ON DELETE SET NULL,
    reviewed_at       TIMESTAMPTZ,
    rejection_reason  TEXT,
    created_at        TIMESTAMPTZ  DEFAULT NOW(),
    updated_at        TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_request_email  ON public.user_request (LOWER(user_email));
CREATE INDEX IF NOT EXISTS idx_user_request_status ON public.user_request (status);

-- ── FCM Push Notification Tokens ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_fcm_tokens (
    id          SERIAL       PRIMARY KEY,
    user_id     UUID         NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    fcm_token   TEXT         NOT NULL,
    device_info VARCHAR(255) DEFAULT '',
    created_at  TIMESTAMPTZ  DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  DEFAULT NOW(),
    UNIQUE (user_id, fcm_token)
);

CREATE INDEX IF NOT EXISTS idx_fcm_user ON public.user_fcm_tokens (user_id);

-- ── In-App Notifications ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
    id         SERIAL       PRIMARY KEY,
    user_id    UUID         NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    title      VARCHAR(255) NOT NULL,
    body       TEXT         NOT NULL,
    data       JSONB        DEFAULT '{}'::jsonb,
    is_read    BOOLEAN      DEFAULT FALSE,
    created_at TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON public.notifications (user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_user_time ON public.notifications (user_id, created_at DESC);

-- =============================================================================
-- SECTION 2 : TASK MANAGEMENT  (public schema)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.tasks (
    id          SERIAL       PRIMARY KEY,
    task_seq    VARCHAR(20),
    title       VARCHAR(255) NOT NULL,
    description TEXT,
    category    VARCHAR(50)  DEFAULT 'general',
    status      VARCHAR(50)  DEFAULT 'responded',
    library_id  VARCHAR(100),
    section_id  VARCHAR(100),
    created_by  UUID         REFERENCES public.users(id) ON DELETE SET NULL,
    assigned_to UUID         REFERENCES public.users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ  DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.task_participants (
    id         SERIAL      PRIMARY KEY,
    task_id    INT         REFERENCES public.tasks(id) ON DELETE CASCADE,
    user_id    UUID        REFERENCES public.users(id) ON DELETE CASCADE,
    role       VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.task_pins (
    id         SERIAL      PRIMARY KEY,
    task_id    INT         REFERENCES public.tasks(id) ON DELETE CASCADE,
    user_id    UUID        REFERENCES public.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (task_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.task_logs (
    id          SERIAL      PRIMARY KEY,
    task_id     INT         REFERENCES public.tasks(id) ON DELETE CASCADE,
    status      VARCHAR(50),
    assigned_to UUID        REFERENCES public.users(id) ON DELETE SET NULL,
    comment     TEXT,
    actor_id    UUID        REFERENCES public.users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Multi-assignee support
CREATE TABLE IF NOT EXISTS public.task_assignees (
    id         SERIAL      PRIMARY KEY,
    task_id    INT         REFERENCES public.tasks(id) ON DELETE CASCADE,
    user_id    UUID        REFERENCES public.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (task_id, user_id)
);

-- Reusable assignee groups
CREATE TABLE IF NOT EXISTS public.task_assignee_groups (
    id          SERIAL       PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    description TEXT,
    created_by  UUID         REFERENCES public.users(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.task_assignee_group_members (
    id         SERIAL      PRIMARY KEY,
    group_id   INT         REFERENCES public.task_assignee_groups(id) ON DELETE CASCADE,
    user_id    UUID        REFERENCES public.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_tasks_category           ON public.tasks (category);
CREATE INDEX IF NOT EXISTS idx_tasks_status             ON public.tasks (status);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned           ON public.tasks (assigned_to);
CREATE INDEX IF NOT EXISTS idx_task_logs_task_id        ON public.task_logs (task_id);
CREATE INDEX IF NOT EXISTS idx_task_assignees_task      ON public.task_assignees (task_id);
CREATE INDEX IF NOT EXISTS idx_task_assignees_user      ON public.task_assignees (user_id);
CREATE INDEX IF NOT EXISTS idx_task_group_members_group ON public.task_assignee_group_members (group_id);

-- =============================================================================
-- SECTION 3 : document_management SCHEMA
-- =============================================================================

-- ── Libraries ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document_management.libraries (
    id                      UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_library_id       UUID         NULL REFERENCES document_management.libraries(id) ON DELETE RESTRICT,
    library_name            VARCHAR(255) NOT NULL,
    description             TEXT,
    display_order           INTEGER      NOT NULL DEFAULT 0,
    status                  VARCHAR(20)  NOT NULL DEFAULT 'active',
    created_by              UUID         NULL,
    updated_by              UUID         NULL,
    pending_removal         BOOLEAN      DEFAULT FALSE,
    removal_requested_by    UUID         REFERENCES public.users(id),
    removal_reason          TEXT,
    removal_requested_at    TIMESTAMPTZ,
    removal_reviewed_by     UUID         REFERENCES public.users(id),
    removal_reviewed_at     TIMESTAMPTZ,
    removal_review_feedback TEXT,
    created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ  NULL,
    CONSTRAINT chk_library_not_own_parent CHECK (parent_library_id IS NULL OR parent_library_id <> id),
    CONSTRAINT chk_library_status         CHECK (status IN ('active', 'suspended', 'archived'))
);

CREATE INDEX IF NOT EXISTS idx_libraries_parent_order ON document_management.libraries (parent_library_id, display_order) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_libraries_status        ON document_management.libraries (status)                           WHERE deleted_at IS NULL;

-- ── Documents  (all migration columns merged in) ──────────────────────────────
CREATE TABLE IF NOT EXISTS document_management.documents (
    id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    library_id               UUID         NOT NULL REFERENCES document_management.libraries(id) ON DELETE RESTRICT,
    document_name            VARCHAR(500) NOT NULL,
    description              TEXT,
    document_type            VARCHAR(100),
    -- Full status set (migrations 002 + 004 merged)
    status                   VARCHAR(20)  NOT NULL DEFAULT 'draft',
    current_version_id       UUID         NULL,
    live_version_id          UUID         NULL,
    pending_revision_id      UUID         NULL,
    has_pending_revision     BOOLEAN      NOT NULL DEFAULT FALSE,
    pending_revision_by      UUID         NULL,
    pending_revision_version VARCHAR(50)  NULL,
    revision_status          VARCHAR(50)  DEFAULT NULL,
    source_type              VARCHAR(20)  NOT NULL DEFAULT 'manual',
    original_file_name       VARCHAR(500),
    original_file_key        TEXT,
    original_mime_type       VARCHAR(150),
    original_file_size       BIGINT,
    created_by               UUID         NULL,
    updated_by               UUID         NULL,
    -- Approval workflow (migration 002)
    requested_by             UUID         NULL REFERENCES public.users(id),
    approved_by              UUID         NULL REFERENCES public.users(id),
    approved_at              TIMESTAMPTZ  NULL,
    rejection_reason         TEXT         NULL,
    -- Removal workflow (migration 004)
    pending_removal          BOOLEAN      NOT NULL DEFAULT FALSE,
    removal_requested_by     UUID         REFERENCES public.users(id),
    removal_reason           TEXT,
    removal_requested_at     TIMESTAMPTZ,
    removal_reviewed_by      UUID         REFERENCES public.users(id),
    removal_reviewed_at      TIMESTAMPTZ,
    removal_review_feedback  TEXT,
    created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at               TIMESTAMPTZ  NULL,
    CONSTRAINT chk_document_status CHECK (
        status IN ('draft','pending','in_review','active','approved','rejected','archived','suspended')
    ),
    CONSTRAINT chk_document_source_type CHECK (source_type IN ('manual', 'upload', 'template')),
    CONSTRAINT chk_document_file_size   CHECK (original_file_size IS NULL OR original_file_size >= 0)
);

CREATE INDEX IF NOT EXISTS idx_documents_library_created ON document_management.documents (library_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documents_status          ON document_management.documents (status)                       WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documents_name_search     ON document_management.documents USING GIN (to_tsvector('simple', document_name));

-- ── Policy User Access Control  (migration 002 + 004 can_delete merged) ──────
CREATE TABLE IF NOT EXISTS document_management.policy_user_access (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID        NOT NULL REFERENCES document_management.documents(id) ON DELETE CASCADE,
    user_id     UUID        NOT NULL REFERENCES public.users(id)                  ON DELETE CASCADE,
    can_view    BOOLEAN     NOT NULL DEFAULT TRUE,
    can_edit    BOOLEAN     NOT NULL DEFAULT FALSE,
    can_delete  BOOLEAN     NOT NULL DEFAULT FALSE,
    granted_by  UUID        NULL REFERENCES public.users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_policy_user_access UNIQUE (document_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_policy_user_access_doc  ON document_management.policy_user_access (document_id);
CREATE INDEX IF NOT EXISTS idx_policy_user_access_user ON document_management.policy_user_access (user_id);

-- ── Document Sections ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document_management.document_sections (
    id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id       UUID         NOT NULL REFERENCES document_management.documents(id)         ON DELETE CASCADE,
    parent_section_id UUID         NULL     REFERENCES document_management.document_sections(id) ON DELETE RESTRICT,
    section_title     VARCHAR(500) NOT NULL,
    section_number    VARCHAR(100),
    section_order     INTEGER      NOT NULL DEFAULT 0,
    content           JSONB        NOT NULL DEFAULT '{"type":"doc","content":[]}'::jsonb,
    page_start        INTEGER      NULL,
    page_end          INTEGER      NULL,
    is_active         BOOLEAN      NOT NULL DEFAULT TRUE,
    lock_version      INTEGER      NOT NULL DEFAULT 1,
    created_by        UUID         NULL,
    updated_by        UUID         NULL,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at        TIMESTAMPTZ  NULL,
    CONSTRAINT chk_section_not_own_parent  CHECK (parent_section_id IS NULL OR parent_section_id <> id),
    CONSTRAINT chk_section_lock_version    CHECK (lock_version >= 1),
    CONSTRAINT chk_section_page_range      CHECK (
        (page_start IS NULL AND page_end IS NULL)
        OR (page_start IS NOT NULL AND page_start > 0
            AND (page_end IS NULL OR page_end >= page_start))
    ),
    CONSTRAINT chk_section_content_object  CHECK (jsonb_typeof(content) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_sections_document_parent_order ON document_management.document_sections (document_id, parent_section_id, section_order) WHERE deleted_at IS NULL AND is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_sections_parent                ON document_management.document_sections (parent_section_id);
CREATE INDEX IF NOT EXISTS idx_sections_content              ON document_management.document_sections USING GIN (content);

-- ── Document Assets ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document_management.document_assets (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID         NOT NULL REFERENCES document_management.documents(id)         ON DELETE CASCADE,
    section_id  UUID         NULL     REFERENCES document_management.document_sections(id) ON DELETE SET NULL,
    file_name   VARCHAR(500) NOT NULL,
    storage_key TEXT         NOT NULL UNIQUE,
    mime_type   VARCHAR(150) NOT NULL,
    file_size   BIGINT       NOT NULL,
    file_hash   VARCHAR(64),
    width       INTEGER      NULL,
    height      INTEGER      NULL,
    uploaded_by UUID         NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at  TIMESTAMPTZ  NULL,
    CONSTRAINT chk_asset_file_size   CHECK (file_size >= 0),
    CONSTRAINT chk_asset_dimensions  CHECK ((width IS NULL OR width > 0) AND (height IS NULL OR height > 0)),
    CONSTRAINT chk_asset_hash        CHECK (file_hash IS NULL OR file_hash ~ '^[0-9a-f]{64}$')
);

CREATE INDEX IF NOT EXISTS idx_assets_document_section ON document_management.document_assets (document_id, section_id) WHERE deleted_at IS NULL;

-- ── Document Versions ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document_management.document_versions (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id       UUID        NOT NULL REFERENCES document_management.documents(id)         ON DELETE CASCADE,
    parent_version_id UUID        NULL     REFERENCES document_management.document_versions(id) ON DELETE RESTRICT,
    version_number    INTEGER     NOT NULL DEFAULT 1,
    version_tag       VARCHAR(50) NULL,
    commit_hash       VARCHAR(64) NOT NULL,
    commit_message    TEXT        NOT NULL,
    committed_by      UUID        NULL,
    committed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_document_version_number UNIQUE (document_id, version_number),
    CONSTRAINT uq_document_commit_hash    UNIQUE (document_id, commit_hash),
    CONSTRAINT chk_version_number         CHECK (version_number >= 1),
    CONSTRAINT chk_commit_hash            CHECK (commit_hash ~ '^[0-9a-f]{64}$')
);

CREATE INDEX IF NOT EXISTS idx_document_versions_doc_num ON document_management.document_versions (document_id, version_number DESC);
CREATE INDEX IF NOT EXISTS idx_document_versions_hash    ON document_management.document_versions (commit_hash);

-- Deferred FK: documents.current_version_id -> document_versions
-- (must be added after document_versions is created)
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

-- ── Document Section Versions ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document_management.document_section_versions (
    id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    section_id           UUID         NOT NULL REFERENCES document_management.document_sections(id) ON DELETE RESTRICT,
    section_title        VARCHAR(500) NOT NULL,
    content              JSONB        NOT NULL,
    annotations_snapshot JSONB        NOT NULL DEFAULT '[]'::jsonb,
    content_hash         VARCHAR(64)  NOT NULL,
    created_by           UUID         NULL,
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_section_content_snapshot    UNIQUE (section_id, content_hash),
    CONSTRAINT chk_section_version_hash       CHECK (content_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT chk_snapshot_content_object    CHECK (jsonb_typeof(content) = 'object'),
    CONSTRAINT chk_annotations_snapshot_array CHECK (jsonb_typeof(annotations_snapshot) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_section_versions_section ON document_management.document_section_versions (section_id, created_at DESC);

-- ── Document Version ↔ Sections join table ────────────────────────────────────
CREATE TABLE IF NOT EXISTS document_management.document_version_sections (
    document_version_id UUID    NOT NULL REFERENCES document_management.document_versions(id)         ON DELETE RESTRICT,
    section_id          UUID    NOT NULL REFERENCES document_management.document_sections(id)         ON DELETE RESTRICT,
    section_version_id  UUID    NOT NULL REFERENCES document_management.document_section_versions(id) ON DELETE RESTRICT,
    parent_section_id   UUID    NULL,
    section_order       INTEGER NOT NULL DEFAULT 0,
    section_number      VARCHAR(100),
    PRIMARY KEY (document_version_id, section_id)
);

CREATE INDEX IF NOT EXISTS idx_version_sections_snapshot ON document_management.document_version_sections (section_version_id);
CREATE INDEX IF NOT EXISTS idx_version_sections_parent   ON document_management.document_version_sections (document_version_id, parent_section_id, section_order);

-- ── Document Version Change Log ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document_management.document_version_changes (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    document_version_id     UUID        NOT NULL REFERENCES document_management.document_versions(id)         ON DELETE RESTRICT,
    section_id              UUID        NOT NULL REFERENCES document_management.document_sections(id)         ON DELETE RESTRICT,
    change_type             VARCHAR(20) NOT NULL,
    old_section_version_id  UUID        NULL REFERENCES document_management.document_section_versions(id)    ON DELETE RESTRICT,
    new_section_version_id  UUID        NULL REFERENCES document_management.document_section_versions(id)    ON DELETE RESTRICT,
    change_summary          TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_version_change_type CHECK (change_type IN ('ADDED', 'UPDATED', 'DELETED', 'MOVED')),
    CONSTRAINT chk_version_change_snapshot_pair CHECK (
        (change_type = 'ADDED'   AND old_section_version_id IS NULL     AND new_section_version_id IS NOT NULL)
        OR (change_type = 'UPDATED' AND old_section_version_id IS NOT NULL AND new_section_version_id IS NOT NULL)
        OR (change_type = 'DELETED' AND old_section_version_id IS NOT NULL AND new_section_version_id IS NULL)
        OR (change_type = 'MOVED'   AND old_section_version_id IS NOT NULL AND new_section_version_id IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_version_changes_version ON document_management.document_version_changes (document_version_id);
CREATE INDEX IF NOT EXISTS idx_version_changes_section ON document_management.document_version_changes (section_id);

-- ── Document Annotations ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document_management.document_annotations (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id     UUID         NOT NULL REFERENCES document_management.documents(id)         ON DELETE CASCADE,
    section_id      UUID         NULL     REFERENCES document_management.document_sections(id) ON DELETE CASCADE,
    asset_id        UUID         NULL     REFERENCES document_management.document_assets(id)   ON DELETE SET NULL,
    annotation_type VARCHAR(20)  NOT NULL,
    category        VARCHAR(20)  NOT NULL DEFAULT 'NOTES',
    anchor_data     JSONB        NOT NULL DEFAULT '{}'::jsonb,
    annotation_text TEXT         NOT NULL,
    reference_code  VARCHAR(100) NULL,
    status          VARCHAR(20)  NOT NULL DEFAULT 'open',
    created_by      UUID         NULL,
    updated_by      UUID         NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ  NULL,
    CONSTRAINT chk_annotation_type          CHECK (annotation_type IN ('TEXT', 'IMAGE')),
    CONSTRAINT chk_annotation_category      CHECK (category IN ('NOTES', 'ACTION', 'CDE', 'REGULATORY', 'REVISION')),
    CONSTRAINT chk_annotation_status        CHECK (status  IN ('open', 'resolved', 'archived')),
    CONSTRAINT chk_annotation_anchor_object CHECK (jsonb_typeof(anchor_data) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_annotations_doc_sec        ON document_management.document_annotations (document_id, section_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_annotations_asset          ON document_management.document_annotations (asset_id)                WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_annotations_reference_code ON document_management.document_annotations (reference_code)         WHERE deleted_at IS NULL;

-- ── Document References ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document_management.document_references (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id     UUID         NOT NULL REFERENCES document_management.documents(id) ON DELETE CASCADE,
    reference_code  VARCHAR(100) NOT NULL,
    title           VARCHAR(500) NOT NULL,
    description     TEXT,
    reference_type  VARCHAR(50)  NOT NULL DEFAULT 'general',
    target_url      TEXT,
    metadata        JSONB        NOT NULL DEFAULT '{}'::jsonb,
    created_by      UUID         NULL,
    updated_by      UUID         NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ  NULL,
    CONSTRAINT uq_doc_reference_code         UNIQUE (document_id, reference_code),
    CONSTRAINT chk_reference_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_references_doc_code ON document_management.document_references (document_id, reference_code) WHERE deleted_at IS NULL;

-- ── Document Activity Logs ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document_management.document_activity_logs (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID         NULL REFERENCES document_management.documents(id) ON DELETE CASCADE,
    library_id  UUID         NULL REFERENCES document_management.libraries(id) ON DELETE SET NULL,
    section_id  UUID         NULL,
    event_type  VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50)  NOT NULL,
    entity_id   UUID         NOT NULL,
    details     JSONB        NOT NULL DEFAULT '{}'::jsonb,
    actor_id    UUID         NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_activity_details_object CHECK (jsonb_typeof(details) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_doc   ON document_management.document_activity_logs (document_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_lib   ON document_management.document_activity_logs (library_id,  created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_actor ON document_management.document_activity_logs (actor_id,    created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_event ON document_management.document_activity_logs (event_type,  created_at DESC);

-- ── Document Templates  (template_approval_columns migration merged in) ───────
CREATE TABLE IF NOT EXISTS document_management.document_templates (
    id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    template_name    VARCHAR(255) NOT NULL,
    template_id      VARCHAR(50)  NULL,
    description      TEXT,
    category         VARCHAR(100) NOT NULL DEFAULT 'General',
    structure        JSONB        NOT NULL DEFAULT '{"sections":[]}'::jsonb,
    status           VARCHAR(30)  NOT NULL DEFAULT 'approved',
    is_active        BOOLEAN      NOT NULL DEFAULT TRUE,
    requested_by     UUID         NULL,
    approved_by      UUID         NULL,
    approved_at      TIMESTAMPTZ  NULL,
    rejection_reason TEXT         NULL,
    created_by       UUID         NULL,
    updated_by       UUID         NULL,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at       TIMESTAMPTZ  NULL,
    CONSTRAINT chk_template_structure_object CHECK (jsonb_typeof(structure) = 'object'),
    CONSTRAINT chk_template_status           CHECK (status IN ('draft', 'pending', 'approved', 'rejected'))
);

CREATE INDEX IF NOT EXISTS idx_templates_category ON document_management.document_templates (category) WHERE deleted_at IS NULL AND is_active = TRUE;
CREATE UNIQUE INDEX IF NOT EXISTS idx_templates_template_id ON document_management.document_templates (template_id) WHERE template_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_templates_status   ON document_management.document_templates (status)   WHERE deleted_at IS NULL AND is_active = TRUE;

-- ── Document Import Jobs ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document_management.document_import_jobs (
    id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id         UUID         NULL REFERENCES document_management.documents(id) ON DELETE SET NULL,
    source_file_name    VARCHAR(500) NOT NULL,
    source_storage_key  TEXT         NOT NULL,
    source_mime_type    VARCHAR(150),
    source_file_size    BIGINT,
    status              VARCHAR(30)  NOT NULL DEFAULT 'queued',
    processing_stage    VARCHAR(100),
    progress_percent    SMALLINT     NOT NULL DEFAULT 0,
    extracted_structure JSONB,
    error_message       TEXT,
    requested_by        UUID         NULL,
    started_at          TIMESTAMPTZ  NULL,
    completed_at        TIMESTAMPTZ  NULL,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_import_status    CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'cancelled')),
    CONSTRAINT chk_import_progress  CHECK (progress_percent BETWEEN 0 AND 100),
    CONSTRAINT chk_import_file_size CHECK (source_file_size IS NULL OR source_file_size >= 0)
);

CREATE INDEX IF NOT EXISTS idx_import_jobs_queue    ON document_management.document_import_jobs (status, created_at) WHERE status IN ('queued', 'processing');
CREATE INDEX IF NOT EXISTS idx_import_jobs_document ON document_management.document_import_jobs (document_id, created_at DESC);

-- ── User Pinned Policies  (migration 005) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS document_management.user_pinned_policies (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES public.users(id)                  ON DELETE CASCADE,
    document_id UUID        NOT NULL REFERENCES document_management.documents(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_user_pinned_policy UNIQUE (user_id, document_id)
);

CREATE INDEX IF NOT EXISTS idx_user_pinned_policies_user ON document_management.user_pinned_policies (user_id);
CREATE INDEX IF NOT EXISTS idx_user_pinned_policies_doc  ON document_management.user_pinned_policies (document_id);

-- =============================================================================
-- SECTION 4 : SEED DATA  — Roles, Modules, Operations, Permissions
-- =============================================================================

-- ── Operations ────────────────────────────────────────────────────────────────
INSERT INTO public.operations (operation_name, display_name) VALUES
    ('create',   'Create'),
    ('read',     'Read'),
    ('update',   'Update'),
    ('delete',   'Delete'),
    ('export',   'Export'),
    ('import',   'Import'),
    ('approval', 'Approval')
ON CONFLICT (operation_name) DO NOTHING;

-- ── Modules ───────────────────────────────────────────────────────────────────
INSERT INTO public.modules (module_name, display_name, is_active) VALUES
    ('users',        'User Management',              TRUE),
    ('roles',        'Role Management',              TRUE),
    ('permissions',  'Permission Management',        TRUE),
    ('userrole',     'User Role Management',         TRUE),
    ('usersrequest', 'New User Request Management',  TRUE),
    ('templates',    'Template Management',          TRUE),
    ('libraries',    'Library Management',           TRUE),
    ('policy_access','Policy Access Control',        TRUE),
    ('documents',    'Policy & Document Management', TRUE)
ON CONFLICT (module_name) DO UPDATE
    SET display_name = EXCLUDED.display_name,
        is_active    = EXCLUDED.is_active;

-- ── Default Roles ─────────────────────────────────────────────────────────────
INSERT INTO public.roles (role_name, description, is_active) VALUES
    ('Super Admin', 'Full unrestricted access to all modules and operations', TRUE),
    ('Admin',       'Administrator access with permission to manage users and roles', TRUE),
    ('User',        'Standard user with basic access', TRUE)
ON CONFLICT (role_name) DO NOTHING;

-- ── Super Admin -> all permissions ───────────────────────────────────────────
INSERT INTO public.role_permissions (role_id, module_id, operation_id)
SELECT r.id, m.id, o.id
FROM   public.roles r
CROSS  JOIN public.modules m
CROSS  JOIN public.operations o
WHERE  r.role_name = 'Super Admin'
ON CONFLICT (role_id, module_id, operation_id) DO NOTHING;

-- ── Admin -> users / roles / permissions (full CRUD) ─────────────────────────
INSERT INTO public.role_permissions (role_id, module_id, operation_id)
SELECT r.id, m.id, o.id
FROM   public.roles r
CROSS  JOIN public.modules m
CROSS  JOIN public.operations o
WHERE  r.role_name  = 'Admin'
  AND  m.module_name IN ('users', 'roles', 'permissions')
ON CONFLICT (role_id, module_id, operation_id) DO NOTHING;

-- ── Admin -> read-only on policy_access (migration 003) ──────────────────────
INSERT INTO public.role_permissions (role_id, module_id, operation_id)
SELECT r.id, m.id, o.id
FROM   public.roles r
CROSS  JOIN public.modules m
CROSS  JOIN public.operations o
WHERE  r.role_name      = 'Admin'
  AND  m.module_name    = 'policy_access'
  AND  o.operation_name = 'read'
ON CONFLICT (role_id, module_id, operation_id) DO NOTHING;

COMMIT;

-- =============================================================================
-- END OF SCHEMA
-- =============================================================================
-- Super-admin user is created at runtime by initDatabase.js which reads
--   SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD / SUPER_ADMIN_NAME  from .env
-- =============================================================================
