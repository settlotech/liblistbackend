const pool = require('../config/db');

async function migrate() {
    console.log('Creating Task management tables...');
    await pool.query(`
        CREATE TABLE IF NOT EXISTS tasks (
            id SERIAL PRIMARY KEY,
            task_seq VARCHAR(20),
            title VARCHAR(255) NOT NULL,
            description TEXT,
            category VARCHAR(50) DEFAULT 'general',
            status VARCHAR(50) DEFAULT 'responded',
            library_id VARCHAR(100),
            section_id VARCHAR(100),
            created_by UUID REFERENCES users(id) ON DELETE SET NULL,
            assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS task_participants (
            id SERIAL PRIMARY KEY,
            task_id INT REFERENCES tasks(id) ON DELETE CASCADE,
            user_id UUID REFERENCES users(id) ON DELETE CASCADE,
            role VARCHAR(50) NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS task_pins (
            id SERIAL PRIMARY KEY,
            task_id INT REFERENCES tasks(id) ON DELETE CASCADE,
            user_id UUID REFERENCES users(id) ON DELETE CASCADE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            UNIQUE(task_id, user_id)
        );

        CREATE TABLE IF NOT EXISTS task_logs (
            id SERIAL PRIMARY KEY,
            task_id INT REFERENCES tasks(id) ON DELETE CASCADE,
            status VARCHAR(50),
            assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
            comment TEXT,
            actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_tasks_category ON tasks(category);
        CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
        CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_to);
        CREATE INDEX IF NOT EXISTS idx_task_logs_task_id ON task_logs(task_id);
    `);
    console.log('Task tables created successfully!');
    process.exit(0);
}

migrate().catch(e => {
    console.error('Migration failed:', e);
    process.exit(1);
});
