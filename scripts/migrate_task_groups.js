const pool = require('../config/db');

async function migrate() {
    console.log('Migrating task assignees and groups tables...');
    await pool.query(`
        -- Multi-assignee support for tasks
        CREATE TABLE IF NOT EXISTS task_assignees (
            id SERIAL PRIMARY KEY,
            task_id INT REFERENCES tasks(id) ON DELETE CASCADE,
            user_id UUID REFERENCES users(id) ON DELETE CASCADE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            UNIQUE(task_id, user_id)
        );

        -- Reusable Assignee Groups
        CREATE TABLE IF NOT EXISTS task_assignee_groups (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            description TEXT,
            created_by UUID REFERENCES users(id) ON DELETE CASCADE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS task_assignee_group_members (
            id SERIAL PRIMARY KEY,
            group_id INT REFERENCES task_assignee_groups(id) ON DELETE CASCADE,
            user_id UUID REFERENCES users(id) ON DELETE CASCADE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            UNIQUE(group_id, user_id)
        );

        CREATE INDEX IF NOT EXISTS idx_task_assignees_task ON task_assignees(task_id);
        CREATE INDEX IF NOT EXISTS idx_task_assignees_user ON task_assignees(user_id);
        CREATE INDEX IF NOT EXISTS idx_task_group_members_group ON task_assignee_group_members(group_id);
    `);
    console.log('Task assignees and groups tables created successfully!');
    process.exit(0);
}

migrate().catch(e => {
    console.error('Migration failed:', e);
    process.exit(1);
});
