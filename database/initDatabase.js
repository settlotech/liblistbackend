const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const pool = require('../config/db');


// Email: settlo@gmail.com
// Password: 123456
// Role: Super Admin 
const seedSuperAdmin = async () => {
    const email = 'settlo@gmail.com';
    const plainPassword = '123456';
    const name = 'Super Admin';
    const rounds = Number(process.env.BCRYPT_ROUNDS || 12);

    try {
        // 1. Ensure Super Admin role exists
        let roleRes = await pool.query(
            `SELECT id FROM roles WHERE LOWER(role_name) = 'super admin' LIMIT 1`
        );

        let roleId;
        if (roleRes.rowCount === 0) {
            const newRole = await pool.query(
                `INSERT INTO roles (role_name, description, is_active)
                 VALUES ('Super Admin', 'Full unrestricted access to all modules and operations', TRUE)
                 RETURNING id`
            );
            roleId = newRole.rows[0].id;
        } else {
            roleId = roleRes.rows[0].id;
        }

        // 2. Hash password
        const hashedPassword = await bcrypt.hash(plainPassword, rounds);

        // 3. Upsert user
        let userRes = await pool.query(
            `SELECT id FROM users WHERE LOWER(email) = LOWER($1)`,
            [email]
        );

        let userId;
        if (userRes.rowCount === 0) {
            const insertRes = await pool.query(
                `INSERT INTO users (name, email, password, is_active)
                 VALUES ($1, $2, $3, TRUE)
                 RETURNING id`,
                [name, email, hashedPassword]
            );
            userId = insertRes.rows[0].id;
            console.log(` Default Super Admin created: ${email}`);
        } else {
            userId = userRes.rows[0].id;
            await pool.query(
                `UPDATE users
                 SET password = $1, is_active = TRUE, updated_at = NOW()
                 WHERE id = $2`,
                [hashedPassword, userId]
            );
            console.log(`Default Super Admin password/active verified: ${email}`);
        }

        // 4. Ensure Super Admin role mapping
        if (userId && roleId) {
            await pool.query(
                `INSERT INTO user_roles (user_id, role_id)
                 VALUES ($1, $2)
                 ON CONFLICT (user_id, role_id) DO NOTHING`,
                [userId, roleId]
            );
        }

        // 5. Ensure default settings
        if (userId) {
            await pool.query(
                `INSERT INTO user_settings (user_id, theme, button_color)
                 VALUES ($1, 'system', '#075bb9')
                 ON CONFLICT (user_id) DO NOTHING`,
                [userId]
            );
        }

        console.log(`Super Admin account ready: ${email}`);
    } catch (err) {
        console.error('Error verifying default Super Admin account:', err.message);
    }
};

const initDatabase = async () => {
    try {

        // Default basic Tables
        const schemaPath = path.join(__dirname, 'schema.sql');
        const sql = fs.readFileSync(schemaPath, 'utf8'); 
        await pool.query(sql);
        console.log('Database tables created successfully');

        // Apply Task Management Module schema migration
        const migrationPath = path.join(__dirname, 'task_tables_migration.sql');
        if (fs.existsSync(migrationPath)) {
            const migrationSql = fs.readFileSync(migrationPath, 'utf8');
            await pool.query(migrationSql);
            console.log('Task Management Module migration applied successfully');
        }

        // Apply Document Management System schema (libSchema.sql)
        const dmsSchemaPath = path.join(__dirname, 'libSchema.sql');
        if (fs.existsSync(dmsSchemaPath)) {
            const dmsSql = fs.readFileSync(dmsSchemaPath, 'utf8');
            await pool.query(dmsSql);
            console.log('Document Management schema  applied successfully');
        }

        await seedSuperAdmin();
    } catch (error) {
        console.error('Database initialization failed:', error);
        throw error;
    }
};

module.exports = initDatabase;
module.exports.seedSuperAdmin = seedSuperAdmin;
