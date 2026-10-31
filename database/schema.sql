CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Institutional Users (With JWT and Multi-Tenant RBAC)
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL DEFAULT '',
    role VARCHAR(50) NOT NULL DEFAULT 'employee',
    role_type VARCHAR(50) DEFAULT 'employee',
    department VARCHAR(100) DEFAULT 'Retail Banking',
    avatar VARCHAR(50) DEFAULT 'SJ',
    bank_id VARCHAR(50) DEFAULT 'cba',
    is_active BOOLEAN DEFAULT TRUE,
    token_version INTEGER NOT NULL DEFAULT 0,
    created_by VARCHAR(100) DEFAULT 'System Seed',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure additional auth columns exist if table was already created
ALTER TABLE users ADD COLUMN IF NOT EXISTS password VARCHAR(255) DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS role_type VARCHAR(50) DEFAULT 'employee';
ALTER TABLE users ADD COLUMN IF NOT EXISTS department VARCHAR(100) DEFAULT 'Retail Banking';
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar VARCHAR(50) DEFAULT 'SJ';
ALTER TABLE users ADD COLUMN IF NOT EXISTS bank_id VARCHAR(50) DEFAULT 'cba';
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 2. JWT Refresh Tokens with Token Family Rotation
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

-- 3. Workflow Tasks (APRA CPS 234 Tracking)
CREATE TABLE IF NOT EXISTS tasks (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    assigned_to VARCHAR(100) NOT NULL,
    assigned_by VARCHAR(100) DEFAULT 'Marcus Vance (Bank Owner)',
    priority VARCHAR(50) DEFAULT 'medium',
    status VARCHAR(50) DEFAULT 'pending',
    due_date VARCHAR(100),
    category VARCHAR(100) DEFAULT 'APRA CPS 234 Audit',
    linked_policy_id VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
