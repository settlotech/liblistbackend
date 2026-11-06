
-- 1. Ensure pgcrypto extension is available for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Handle legacy tasks table (rename if id is integer to prevent UUID foreign key conflict)
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

-- 3. Ensure the task_code sequence exists
CREATE SEQUENCE IF NOT EXISTS task_code_sequence START 1;

-- 4. Create tasks table (corrected: category excludes 'pinned', task_code = TASK-xxxxxx)
CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_code VARCHAR(50) UNIQUE NOT NULL
        DEFAULT ('TASK-' || LPAD(nextval('task_code_sequence')::TEXT, 6, '0')),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(20) NOT NULL DEFAULT 'general'
        CHECK (category IN ('common', 'general')),
    created_from VARCHAR(30) NOT NULL DEFAULT 'task_pane'
        CHECK (created_from IN ('task_pane')),
    library_id VARCHAR(100) NULL,
    section_id VARCHAR(100) NULL,
    created_by UUID NOT NULL REFERENCES users(id),
    assigned_to UUID NULL REFERENCES users(id),
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','responded','completed','approved','cancelled')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Create task_participants table
CREATE TABLE IF NOT EXISTS task_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('approver','reviewer','for_info')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(task_id, user_id, role)
);

-- 5. Create task_logs table (includes 'completed' action)
CREATE TABLE IF NOT EXISTS task_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    action VARCHAR(30) NOT NULL
        CHECK (action IN (
            'created','assigned','reassigned','status_changed',
            'approved','responded','completed','cancelled','commented','updated'
        )),
    performed_by UUID NOT NULL REFERENCES users(id),
    old_value TEXT,
    new_value TEXT,
    comment TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure task_logs_action_check constraint includes 'completed' on existing tables
DO $$
BEGIN
    ALTER TABLE task_logs DROP CONSTRAINT IF EXISTS task_logs_action_check;
    ALTER TABLE task_logs ADD CONSTRAINT task_logs_action_check 
        CHECK (action IN (
            'created','assigned','reassigned','status_changed',
            'approved','responded','completed','cancelled','commented','updated'
        ));
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- 6. Create user_task_pins table
CREATE TABLE IF NOT EXISTS user_task_pins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pinned_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(task_id, user_id)
);

-- 7. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_tasks_created_by     ON tasks(created_by);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to    ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_status         ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_category       ON tasks(category);
CREATE INDEX IF NOT EXISTS idx_tasks_updated_at     ON tasks(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_logs_task_id    ON task_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_task_logs_created_at ON task_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_participants_user ON task_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_user_task_pins_user  ON user_task_pins(user_id);
CREATE INDEX IF NOT EXISTS idx_user_task_pins_task  ON user_task_pins(task_id);

-- 8. Auto-update updated_at trigger function
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 9. Attach trigger to tasks table
DROP TRIGGER IF EXISTS trg_tasks_updated_at ON tasks;
CREATE TRIGGER trg_tasks_updated_at
    BEFORE UPDATE ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- Tasks module is common for all users (No RBAC)

-- =============================================================================
-- CORRECTIVE: If the old tasks table (SERIAL id) exists, rename it
-- and recreate with the new schema (run only if migration from legacy needed)
-- The DO block below is safe — it checks column type first.
-- =============================================================================
DO $$
BEGIN
    -- Fix task_code default prefix: change SETTLO- to TASK- if needed
    IF EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname = 'tasks' AND n.nspname = 'public'
    ) THEN
        -- Attempt to update the default on task_code column
        BEGIN
            ALTER TABLE tasks
                ALTER COLUMN task_code
                SET DEFAULT ('TASK-' || LPAD(nextval('task_code_sequence')::TEXT, 6, '0'));
        EXCEPTION WHEN OTHERS THEN
            NULL; -- column may already have correct default
        END;
    END IF;
END $$;
