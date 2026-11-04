CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Users Table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash CHAR(64) NOT NULL UNIQUE,
    family_id UUID NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    replaced_by_hash CHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User Settings Table (Preferences: Theme, Button Color, etc.)
CREATE TABLE IF NOT EXISTS user_settings (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    theme VARCHAR(20) NOT NULL DEFAULT 'system',
    button_color VARCHAR(30) NOT NULL DEFAULT '#075bb9',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Password Reset Tokens / OTP Table
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    otp VARCHAR(10) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_request (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_email VARCHAR(255) NOT NULL,
    user_name VARCHAR(100),
    otp_hash VARCHAR(255),
    expires_at TIMESTAMPTZ,
    is_email_verified BOOLEAN DEFAULT FALSE,
    is_used BOOLEAN DEFAULT FALSE,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMPTZ,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_fcm_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    fcm_token TEXT NOT NULL,
    device_info TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_user_fcm_token UNIQUE(user_id, fcm_token)
);

 CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    data JSONB DEFAULT '{}'::jsonb,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);


 
-- CREATE INDEX IF NOT EXISTS idx_user_devices_user_id ON user_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_reset_user_otp ON password_reset_tokens(user_id, otp);

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



CREATE INDEX IF NOT EXISTS idx_user_fcm_tokens_user ON user_fcm_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);
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
INSERT INTO modules (module_name, display_name, is_active)
VALUES
    ('users', 'User Management', TRUE),
    ('roles', 'Role Management', TRUE),
    ('permissions', 'Permission Management', TRUE),
    ('userrole', 'User Role Management', TRUE),
    ('documents', 'Document Management', TRUE),
    ('usersrequest', 'New User Request Management', TRUE)
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

-- ==========================================
-- 7. Default Super Admin User Account
-- Email: settlo@gmail.com
-- Password: 123456
-- Role: Super Admin
-- ==========================================
DO $$
DECLARE
    v_role_id INTEGER;
    v_user_id UUID;
    v_hashed_pwd TEXT;
BEGIN
    -- 1. Get Super Admin role ID
    SELECT id INTO v_role_id FROM roles WHERE LOWER(role_name) = 'super admin' LIMIT 1;

    -- 2. Generate bcrypt hash for '123456' using pgcrypto blowfish crypt
    v_hashed_pwd := crypt('123456', gen_salt('bf', 12));

    -- 3. Insert or update default Super Admin user
    INSERT INTO users (name, email, password, is_active)
    VALUES ('Super Admin', 'settlo@gmail.com', v_hashed_pwd, TRUE)
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





