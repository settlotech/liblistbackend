const fs   = require('fs');
const path = require('path');
const pool = require('../config/db');
const bcrypt = require('bcrypt');
require('dotenv').config();

 
const seedSuperAdmin = async () => {
    const email         = process.env.SUPER_ADMIN_EMAIL;
    const plainPassword = process.env.SUPER_ADMIN_PASSWORD;
    const name          = process.env.SUPER_ADMIN_NAME;
    const rounds        = Number(process.env.BCRYPT_ROUNDS) || 10;
    const client        = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Ensure Super Admin role exists
        const roleRes = await client.query(
            `INSERT INTO roles (role_name, description, is_active)
             VALUES ($1, $2, TRUE)
             ON CONFLICT (role_name) DO UPDATE SET is_active = TRUE
             RETURNING id`,
            ['Super Admin', 'Full unrestricted access to all modules and operations']
        );
        const roleId = roleRes.rows[0].id;

        // 2. Hash password
        const hashedPassword = await bcrypt.hash(plainPassword, rounds);

        // 3. Create or update Super Admin user
        const userRes = await client.query(
            `INSERT INTO users (name, email, password, is_active)
             VALUES ($1, $2, $3, TRUE)
             ON CONFLICT (email)
             DO UPDATE SET
                name      = EXCLUDED.name,
                password  = EXCLUDED.password,
                is_active = TRUE,
                updated_at = NOW()
             RETURNING id`,
            [name, email, hashedPassword]
        );
        const userId = userRes.rows[0].id;

        // 4. Assign Super Admin role
        await client.query(
            `INSERT INTO user_roles (user_id, role_id)
             VALUES ($1, $2)
             ON CONFLICT (user_id, role_id) DO NOTHING`,
            [userId, roleId]
        );

        // 5. Default user settings
        await client.query(
            `INSERT INTO user_settings (user_id, theme, button_color)
             VALUES ($1, 'system', '#075bb9')
             ON CONFLICT (user_id) DO NOTHING`,
            [userId]
        );

        await client.query('COMMIT');
        console.log(`Super Admin account ready: ${email}`);
    } catch (error) {
        await client.query('ROLLBACK');
        console.error(' Super Admin seeding failed:', error.message);
        throw error;
    } finally {
        client.release();
    }
};


const initializeDatabase = async () => {
    try {
        console.log('Initializing database...');

        // ── Run the single complete schema (all tables + seed data) ────────
        const completeSqlPath = path.join(__dirname, 'migrations', 'complete_schema.sql'); 
        if (fs.existsSync(completeSqlPath)) { 
            const sql = fs.readFileSync(completeSqlPath, 'utf8');
            await pool.query(sql); 
        } else { 
            const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
            await pool.query(schema);
            console.log('schema.sql applied.');

            const liblistSchemaPath = path.join(__dirname, 'liblistSchema.sql');
            if (fs.existsSync(liblistSchemaPath)) {
                await pool.query(fs.readFileSync(liblistSchemaPath, 'utf8'));

                // Safety: ensure extra columns that may be missing on old DBs
                await pool.query(`
                    ALTER TABLE document_management.documents ADD COLUMN IF NOT EXISTS live_version_id UUID NULL;
                    ALTER TABLE document_management.documents ADD COLUMN IF NOT EXISTS pending_revision_id UUID NULL;
                    ALTER TABLE document_management.documents ADD COLUMN IF NOT EXISTS has_pending_revision BOOLEAN NOT NULL DEFAULT FALSE;
                    ALTER TABLE document_management.documents ADD COLUMN IF NOT EXISTS pending_revision_by UUID NULL;
                    ALTER TABLE document_management.documents ADD COLUMN IF NOT EXISTS pending_revision_version VARCHAR(50) NULL;
                    ALTER TABLE document_management.documents ADD COLUMN IF NOT EXISTS revision_status VARCHAR(50) DEFAULT NULL;
                    ALTER TABLE document_management.documents ADD COLUMN IF NOT EXISTS requested_by UUID NULL;
                    ALTER TABLE document_management.documents ADD COLUMN IF NOT EXISTS approved_by UUID NULL;
                    ALTER TABLE document_management.documents ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ NULL;
                    ALTER TABLE document_management.documents ADD COLUMN IF NOT EXISTS rejection_reason TEXT NULL;
                    ALTER TABLE document_management.documents ADD COLUMN IF NOT EXISTS pending_removal BOOLEAN NOT NULL DEFAULT FALSE;
                    ALTER TABLE document_management.documents ADD COLUMN IF NOT EXISTS removal_requested_by UUID NULL;
                    ALTER TABLE document_management.documents ADD COLUMN IF NOT EXISTS removal_reason TEXT;
                    ALTER TABLE document_management.documents ADD COLUMN IF NOT EXISTS removal_requested_at TIMESTAMPTZ;
                    ALTER TABLE document_management.documents ADD COLUMN IF NOT EXISTS removal_reviewed_by UUID NULL;
                    ALTER TABLE document_management.documents ADD COLUMN IF NOT EXISTS removal_reviewed_at TIMESTAMPTZ;
                    ALTER TABLE document_management.documents ADD COLUMN IF NOT EXISTS removal_review_feedback TEXT;
                `);
                console.log('liblistSchema.sql applied.');
            }

            const seed = fs.readFileSync(path.join(__dirname, 'seed.sql'), 'utf8');
            await pool.query(seed);
            console.log('seed.sql applied.');
        }

        const policyChatMigrationPath = path.join(__dirname, 'migrations', '006_policy_chat.sql');
        if (fs.existsSync(policyChatMigrationPath)) {
            await pool.query(fs.readFileSync(policyChatMigrationPath, 'utf8'));
            console.log('Policy chat migration applied.');
        }
        const privateChatMigrationPath = path.join(__dirname, 'migrations', '007_private_chats.sql');
        if (fs.existsSync(privateChatMigrationPath)) {
            await pool.query(fs.readFileSync(privateChatMigrationPath, 'utf8'));
            console.log('Private chat migration applied.');
        }

        // ── 2. Seed Super Admin user ──────────────────────────────────────────
        await seedSuperAdmin();

        console.log('Database initialisation complete.');
    } catch (error) {
        console.error('Database initialisation failed:', error.message);
        process.exitCode = 1;
        throw error;
    }
};

module.exports = initializeDatabase;
