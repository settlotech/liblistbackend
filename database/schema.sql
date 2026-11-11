CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- CREATE EXTENSION IF NOT EXISTS vector;


-- Users Table
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::varchar,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    token_version INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Roles Table
CREATE TABLE IF NOT EXISTS roles (
    id SERIAL PRIMARY KEY,
    role_name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Modules Table (e.g., users, roles, books, reports)
CREATE TABLE IF NOT EXISTS modules (
    id SERIAL PRIMARY KEY,
    module_name VARCHAR(100) UNIQUE NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE
);

-- Operations Table (e.g., create, read, update, delete, export, import)
CREATE TABLE IF NOT EXISTS operations (
    id SERIAL PRIMARY KEY,
    operation_name VARCHAR(50) UNIQUE NOT NULL,
    display_name VARCHAR(50) NOT NULL
);

-- User Roles Mapping Table (Many-to-Many: Users <-> Roles)
CREATE TABLE IF NOT EXISTS user_roles (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE, 
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, role_id)
);

-- Role Permissions Mapping Table (Many-to-Many: Roles <-> Modules <-> Operations)
CREATE TABLE IF NOT EXISTS role_permissions (
    id SERIAL PRIMARY KEY,
    role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    module_id INTEGER NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
    operation_id INTEGER NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(role_id, module_id, operation_id)
);

-- Refresh Tokens Table
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash CHAR(64) NOT NULL UNIQUE,
    family_id VARCHAR(255) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    replaced_by_hash CHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User Settings Table (Preferences: Theme, Button Color, etc.)
CREATE TABLE IF NOT EXISTS user_settings (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    theme VARCHAR(20) NOT NULL DEFAULT 'system',
    button_color VARCHAR(30) NOT NULL DEFAULT '#075bb9',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Password Reset Tokens / OTP Table
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    otp VARCHAR(10) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);



-- User FCM Push Notification Tokens Table
CREATE TABLE IF NOT EXISTS user_fcm_tokens (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    fcm_token TEXT NOT NULL,
    device_info VARCHAR(255) DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, fcm_token)
);

CREATE INDEX IF NOT EXISTS idx_fcm_user ON user_fcm_tokens(user_id);

-- In-App Notifications Table
CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    data JSONB DEFAULT '{}'::jsonb,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_user_time ON notifications(user_id, created_at DESC);

-- User Onboarding & Access Requests Table
CREATE TABLE IF NOT EXISTS user_request (
    id SERIAL PRIMARY KEY,
    user_email VARCHAR(255) NOT NULL,
    user_name VARCHAR(100),
    otp_hash VARCHAR(255),
    expires_at TIMESTAMPTZ,
    is_email_verified BOOLEAN DEFAULT FALSE,
    status VARCHAR(50) DEFAULT 'pending',
    is_used BOOLEAN DEFAULT FALSE,
    reviewed_by VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_request_email ON user_request(LOWER(user_email));
CREATE INDEX IF NOT EXISTS idx_user_request_status ON user_request(status);

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


CREATE INDEX IF NOT EXISTS idx_dept_parent ON departments(parent_id);
CREATE INDEX IF NOT EXISTS idx_dept_sort ON departments(sort_order ASC);

CREATE INDEX IF NOT EXISTS idx_reset_user_otp ON password_reset_tokens(user_id, otp);

CREATE INDEX IF NOT EXISTS idx_policies_dept ON policies(department_id);
CREATE INDEX IF NOT EXISTS idx_policies_status ON policies(status);
CREATE INDEX IF NOT EXISTS idx_policies_masked ON policies(is_masked);




-- Indexes for optimal RBAC lookup performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON user_roles(role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_module_op ON role_permissions(module_id, operation_id);
CREATE INDEX IF NOT EXISTS idx_refresh_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_family ON refresh_tokens(family_id);
CREATE INDEX IF NOT EXISTS idx_refresh_expiry ON refresh_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);

-- ==========================================
-- Initial Seeds for Dynamic RBAC
-- ==========================================

-- 1. Default Operations
INSERT INTO operations (operation_name, display_name)
VALUES
    ('create', 'Create'),
    ('read', 'Read'),
    ('update', 'Update'),
    ('delete', 'Delete'),
    ('export', 'Export'),
    ('import', 'Import')
ON CONFLICT (operation_name) DO NOTHING;

-- 2. Default Modules
-- Register the Predefined Module by Developers
DELETE FROM modules
WHERE module_name IN (
    'dashboard',
    'changelogs',
    'tasks',
    'templates',
    'documents'
);
INSERT INTO modules (module_name, display_name, is_active)
VALUES
    ('users', 'User Management', TRUE),
    ('roles', 'Role Management', TRUE),
    ('permissions', 'Permission Management', TRUE),
    ('userrole', 'User Role Management', TRUE),
    -- ('documents', 'Document Management', TRUE),
    ('usersrequest', 'New User Request Management', TRUE)
    -- ('dashboard', 'DashBoard', TRUE),
    -- ('changelogs', 'Change Management', TRUE),
    -- ('tasks', 'APRA CPS 234 Tasks', TRUE),
    -- ('templates', 'Policy Templates', TRUE)
ON CONFLICT (module_name) DO NOTHING;

-- 3. Default Roles
INSERT INTO roles (role_name, description, is_active)
VALUES
    ('Super Admin', 'Full unrestricted access to all modules and operations', TRUE),
    ('Admin', 'Administrator access with permission to manage users and roles', TRUE),
    ('User', 'Standard user with basic access', TRUE)
ON CONFLICT (role_name) DO NOTHING;

-- 4. Grant Super Admin all operations on all modules
INSERT INTO role_permissions (role_id, module_id, operation_id)
SELECT r.id, m.id, o.id
FROM roles r
CROSS JOIN modules m
CROSS JOIN operations o
WHERE r.role_name = 'Super Admin'
ON CONFLICT (role_id, module_id, operation_id) DO NOTHING;

-- 5. Grant Admin full access to users and roles modules
INSERT INTO role_permissions (role_id, module_id, operation_id)
SELECT r.id, m.id, o.id
FROM roles r
CROSS JOIN modules m
CROSS JOIN operations o
WHERE r.role_name = 'Admin'
  AND m.module_name IN ('users', 'roles', 'permissions')
ON CONFLICT (role_id, module_id, operation_id) DO NOTHING;

-- 6. Grant User read access to users module
INSERT INTO role_permissions (role_id, module_id, operation_id)
SELECT r.id, m.id, o.id
FROM roles r
CROSS JOIN modules m
CROSS JOIN operations o
WHERE r.role_name = 'User'
  AND m.module_name = 'users'
  AND o.operation_name = 'read'
ON CONFLICT (role_id, module_id, operation_id) DO NOTHING;


-- Safe migration for existing legacy tasks table
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'tasks' 
          AND column_name = 'id' 
          AND data_type IN ('integer', 'bigint', 'smallint')
    ) THEN
        DROP TABLE IF EXISTS task_participants CASCADE;
        DROP TABLE IF EXISTS task_logs CASCADE;
        DROP TABLE IF EXISTS user_task_pins CASCADE;
        ALTER TABLE tasks RENAME TO legacy_compliance_tasks;
    END IF;
END $$;

CREATE SEQUENCE IF NOT EXISTS task_code_sequence START 1;

CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_code VARCHAR(50) UNIQUE NOT NULL DEFAULT ('TASK-' || LPAD(nextval('task_code_sequence')::TEXT, 6, '0')),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(20) NOT NULL DEFAULT 'general' CHECK (category IN ('common', 'general')),
    created_from VARCHAR(30) NOT NULL DEFAULT 'task_pane' CHECK (created_from = 'task_pane'),
    library_id VARCHAR(100),
    section_id VARCHAR(100),
    created_by VARCHAR(255) NOT NULL REFERENCES users(id),
    assigned_to VARCHAR(255) REFERENCES users(id),
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN (
                'pending',
                'responded',
                'completed',
                'approved',
                'cancelled'
            )
        ),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS task_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('approver','reviewer','for_info' )),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(task_id, user_id, role)
);

CREATE SEQUENCE IF NOT EXISTS task_code_sequence START 1;
ALTER TABLE tasks ALTER COLUMN task_code SET DEFAULT ('TASK-' || LPAD(nextval('task_code_sequence')::TEXT, 6, '0'));
CREATE TABLE IF NOT EXISTS task_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    action VARCHAR(30) NOT NULL
        CHECK (
            action IN (
                'created',
                'assigned',
                'reassigned',
                'status_changed',
                'approved',
                'responded',
                'completed',
                'cancelled',
                'commented',
                'updated'
            )
        ),

    performed_by VARCHAR(255) NOT NULL REFERENCES users(id),
    old_value TEXT,
    new_value TEXT,
    comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_task_pins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pinned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(task_id, user_id)
);



CREATE INDEX IF NOT EXISTS idx_tasks_created_by ON tasks(created_by);

CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX  IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS  idx_tasks_category ON tasks(category);
CREATE INDEX IF NOT EXISTS idx_tasks_library ON tasks(library_id, section_id);
CREATE INDEX IF NOT EXISTS idx_task_logs_task_id ON task_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_task_logs_created_at ON task_logs(created_at DESC);
CREATE INDEX  IF NOT EXISTS idx_task_participants_user ON task_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_user_task_pins_user ON user_task_pins(user_id);


DO $$
DECLARE
    v_role_id INTEGER;
    v_user_id VARCHAR(255);
    v_hashed_pwd TEXT;
BEGIN
    -- 1. Get Super Admin role ID
    SELECT id INTO v_role_id FROM roles WHERE LOWER(role_name) = 'super admin' LIMIT 1;

    -- 2. Generate bcrypt hash for '123456' using pgcrypto blowfish crypt
    v_hashed_pwd := crypt('123456', gen_salt('bf', 12));

    -- 3. Insert or update default Super Admin user
    INSERT INTO users (name, email, password, role, role_type, is_active)
    VALUES ('Super Admin', 'settlo@gmail.com', v_hashed_pwd, 'Super Admin', 'admin', TRUE)
    ON CONFLICT (email) DO UPDATE
    SET password = EXCLUDED.password,
        is_active = TRUE,
        updated_at = NOW()
    RETURNING id INTO v_user_id;

    -- Fallback retrieval if RETURNING did not fire
    IF v_user_id IS NULL THEN
        SELECT id INTO v_user_id FROM users WHERE LOWER(email) = 'settlo@gmail.com';
    END IF;

    -- 4. Map user to Super Admin role
    IF v_role_id IS NOT NULL AND v_user_id IS NOT NULL THEN
        INSERT INTO user_roles (user_id, role_id)
        VALUES (v_user_id, v_role_id)
        ON CONFLICT (user_id, role_id) DO NOTHING;
    END IF;

    -- 5. Seed default user settings
    IF v_user_id IS NOT NULL THEN
        INSERT INTO user_settings (user_id, theme, button_color)
        VALUES (v_user_id, 'system', '#075bb9')
        ON CONFLICT (user_id) DO NOTHING;
    END IF;
END $$;

