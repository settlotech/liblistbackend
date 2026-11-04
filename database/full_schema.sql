-- =============================================================================
-- LibTrak OmniSpec Hub - Unified Australian Banking Database Schema
-- Database Engine: PostgreSQL 15+ (Neon Cloud DB)
-- Extensions: pgcrypto, vector (pgvector)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

-- -----------------------------------------------------------------------------
-- 1. MODULE: DEPARTMENTS & INSTITUTIONAL HIERARCHY
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS departments (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    icon VARCHAR(50) DEFAULT 'folder',
    parent_id VARCHAR(100) REFERENCES departments(id) ON DELETE SET NULL,
    hierarchy_level VARCHAR(50) DEFAULT 'section', -- 'group', 'functional', 'section'
    sort_order INT DEFAULT 0,
    created_by VARCHAR(100) DEFAULT 'System Administrator',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dept_parent ON departments(parent_id);
CREATE INDEX IF NOT EXISTS idx_dept_sort ON departments(sort_order ASC);

-- -----------------------------------------------------------------------------
-- 2. MODULE: BANKING POLICIES & STANDARD OPERATING PROCEDURES (SOPs)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS policies (
    id VARCHAR(100) PRIMARY KEY,
    department_id VARCHAR(100) REFERENCES departments(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    summary TEXT,
    version VARCHAR(20) DEFAULT '1.0',
    status VARCHAR(50) DEFAULT 'active', -- 'active', 'inactive', 'pending_approval', 'draft'
    is_masked BOOLEAN DEFAULT FALSE,     -- Document Masking for confidential bank policies
    content TEXT NOT NULL,
    parameters JSONB DEFAULT '{}'::jsonb, -- Limits, Turnaround SLAs, Verification Steps, Phases
    created_by VARCHAR(100) DEFAULT 'Staff Submitter',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_policies_dept ON policies(department_id);
CREATE INDEX IF NOT EXISTS idx_policies_status ON policies(status);
CREATE INDEX IF NOT EXISTS idx_policies_masked ON policies(is_masked);

-- -----------------------------------------------------------------------------
-- 3. MODULE: POLICY VERSION HISTORY SNAPSHOTS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS policy_versions (
    id SERIAL PRIMARY KEY,
    policy_id VARCHAR(100) NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
    version_number VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    parameters JSONB DEFAULT '{}'::jsonb,
    changed_by VARCHAR(100) NOT NULL,
    change_summary TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_policy_versions_policy ON policy_versions(policy_id);

-- -----------------------------------------------------------------------------
-- 4. MODULE: GOVERNANCE & 4-EYES MAKER-CHECKER APPROVALS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS maker_checker_requests (
    id SERIAL PRIMARY KEY,
    policy_id VARCHAR(100) REFERENCES policies(id) ON DELETE CASCADE,
    policy_title VARCHAR(255) NOT NULL,
    department_name VARCHAR(100),
    maker_name VARCHAR(100) NOT NULL,
    maker_role VARCHAR(100) DEFAULT 'Bank Employee',
    proposed_changes JSONB NOT NULL,
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
    checker_name VARCHAR(100),
    checker_comments TEXT,
    is_closed BOOLEAN DEFAULT FALSE,      -- Acknowledgement toggle
    created_at TIMESTAMPTZ DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_mc_status ON maker_checker_requests(status);
CREATE INDEX IF NOT EXISTS idx_mc_policy ON maker_checker_requests(policy_id);

-- -----------------------------------------------------------------------------
-- 5. MODULE: AUDIT TRAIL & CHANGE CONTROL LOGS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS change_logs (
    id SERIAL PRIMARY KEY,
    entity_type VARCHAR(50) NOT NULL, -- 'policy', 'department', 'task', 'maker_checker'
    entity_id VARCHAR(100) NOT NULL,
    user_name VARCHAR(100) NOT NULL,
    action VARCHAR(50) NOT NULL,      -- 'CREATED', 'CONFIGURED', 'ARCHIVED', 'ACTIVATED', 'APPROVED', 'REJECTED', 'MASKED'
    section_name VARCHAR(255),
    details TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_change_entity ON change_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_change_time ON change_logs(timestamp DESC);

-- -----------------------------------------------------------------------------
-- 6. MODULE: CONTEXTUAL ARTIFACTS (PANE 3 TABS)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contextual_artifacts (
    id SERIAL PRIMARY KEY,
    policy_id VARCHAR(100) NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
    tab_type VARCHAR(50) NOT NULL, -- 'training', 'reports', 'issues', 'faqs', 'regulatory'
    title VARCHAR(255) NOT NULL,
    description TEXT,
    url_or_file VARCHAR(500),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_artifacts_policy_tab ON contextual_artifacts(policy_id, tab_type);

-- -----------------------------------------------------------------------------
-- 7. MODULE: OPERATIONAL PERFORMANCE METRICS & APRA SLAS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS operational_metrics (
    id SERIAL PRIMARY KEY,
    department_id VARCHAR(100) REFERENCES departments(id) ON DELETE CASCADE,
    metric_name VARCHAR(255) NOT NULL,
    target_value VARCHAR(100) NOT NULL,
    actual_value VARCHAR(100) NOT NULL,
    sla_hours INT DEFAULT 24,
    sla_status VARCHAR(50) DEFAULT 'optimal', -- 'optimal', 'attention', 'breached'
    report_format VARCHAR(50) DEFAULT 'url',  -- 'pdf', 'excel', 'url'
    report_link VARCHAR(500),
    trend_data JSONB DEFAULT '[]'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_metrics_dept ON operational_metrics(department_id);

-- -----------------------------------------------------------------------------
-- 8. MODULE: DYNAMIC POLICY STARTER TEMPLATES
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS policy_templates (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    title VARCHAR(255) NOT NULL,
    department_id VARCHAR(100) REFERENCES departments(id) ON DELETE SET NULL,
    summary TEXT,
    sla VARCHAR(50) DEFAULT '4 Hours',
    daily_limit VARCHAR(50) DEFAULT '$25,000 AUD',
    officer_cap VARCHAR(50) DEFAULT '$100,000 AUD',
    sections JSONB DEFAULT '[]'::jsonb,
    phases JSONB DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT TRUE,
    created_by VARCHAR(100) DEFAULT 'System Administrator',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_templates_dept ON policy_templates(department_id);

-- -----------------------------------------------------------------------------
-- 9. MODULE: INSTITUTIONAL USERS & MULTI-TENANT RBAC
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL DEFAULT '',
    role VARCHAR(50) NOT NULL DEFAULT 'Bank Employee',   -- 'Platform Owner', 'Bank Administrator', 'Bank Employee'
    role_type VARCHAR(50) NOT NULL DEFAULT 'employee',  -- 'admin', 'manager', 'employee'
    department VARCHAR(100) DEFAULT 'Retail Banking',
    avatar VARCHAR(50) DEFAULT 'SJ',
    bank_id VARCHAR(50) DEFAULT 'cba',                  -- Multi-bank partition ('cba', 'nab', 'wbc', 'anz')
    is_active BOOLEAN DEFAULT TRUE,
    token_version INTEGER NOT NULL DEFAULT 0,
    created_by VARCHAR(100) DEFAULT 'System Seed',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_bank ON users(bank_id);

-- -----------------------------------------------------------------------------
-- 10. MODULE: JWT REFRESH TOKENS & ROTATION SECURITY
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash CHAR(64) NOT NULL UNIQUE,
    family_id VARCHAR(100) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    replaced_by_hash CHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_family ON refresh_tokens(family_id);
CREATE INDEX IF NOT EXISTS idx_refresh_expiry ON refresh_tokens(expires_at);

-- -----------------------------------------------------------------------------
-- 11. MODULE: COMPLIANCE & OPERATIONAL TASKS (APRA CPS 234)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tasks (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    assigned_to VARCHAR(100) NOT NULL,
    assigned_by VARCHAR(100) DEFAULT 'Marcus Vance (Bank Administrator)',
    priority VARCHAR(50) DEFAULT 'medium', -- 'low', 'medium', 'high', 'urgent'
    status VARCHAR(50) DEFAULT 'pending',   -- 'pending', 'in_progress', 'completed'
    due_date VARCHAR(100),
    category VARCHAR(100) DEFAULT 'APRA CPS 234 Audit',
    linked_policy_id VARCHAR(100) REFERENCES policies(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_policy ON tasks(linked_policy_id);

-- -----------------------------------------------------------------------------
-- 12. MODULE: VECTOR EMBEDDINGS FOR AI RAG KNOWLEDGE BASE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS policy_document_vectors (
    id SERIAL PRIMARY KEY,
    document_name VARCHAR(255) NOT NULL,
    policy_id VARCHAR(100) REFERENCES policies(id) ON DELETE SET NULL,
    department_id VARCHAR(100) REFERENCES departments(id) ON DELETE SET NULL,
    section_title VARCHAR(255) NOT NULL,
    section_type VARCHAR(50) NOT NULL,
    chunk_content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vectors_policy ON policy_document_vectors(policy_id);
CREATE INDEX IF NOT EXISTS idx_vectors_dept ON policy_document_vectors(department_id);

