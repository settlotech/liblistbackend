const fs   = require('fs');
const path = require('path');
const pool = require('../config/db');
const bcrypt = require('bcryptjs');
require('dotenv').config();

 
const seedSuperAdmin = async () => {
    const email         = process.env.SUPER_ADMIN_EMAIL || 'settlo@gmail.com';
    const plainPassword = process.env.SUPER_ADMIN_PASSWORD || '123456';
    const name          = process.env.SUPER_ADMIN_NAME || 'Super Admin';
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

        // Skip heavy DDL when schema already exists (on Vercel or when RUN_DB_INIT_ON_STARTUP=false)
        const skipHeavyInit =
            process.env.RUN_DB_INIT_ON_STARTUP === 'false' ||
            (process.env.VERCEL && process.env.RUN_DB_INIT_ON_STARTUP !== 'true');
        if (skipHeavyInit) {
            try {
                const checkRes = await pool.query(
                    `SELECT to_regclass('public.users') IS NOT NULL AS users_ready,
                            to_regclass('document_management.documents') IS NOT NULL AS dms_ready`
                );
                if (checkRes.rows[0]?.users_ready && checkRes.rows[0]?.dms_ready) {
                    console.log('Database schema already initialized.');
                    return;
                }
            } catch (_) {
                // Proceed to schema apply if inspection failed
            }
        }

        const completeSqlPath = path.join(__dirname, 'migrations', 'complete_schema.sql');
        if (!fs.existsSync(completeSqlPath)) {
            throw new Error(`Canonical database setup file not found: ${completeSqlPath}`);
        }
        await pool.query(fs.readFileSync(completeSqlPath, 'utf8'));
        console.log('complete_schema.sql applied.');

        // ── 2. Seed Super Admin user ──────────────────────────────────────────
        await seedSuperAdmin();

        console.log('Database initialisation complete.');
    } catch (error) {
        console.error('Database initialisation failed:', error.message);
        if (!process.env.VERCEL) {
            process.exitCode = 1;
        }
        throw error;
    }
};

module.exports = initializeDatabase;
