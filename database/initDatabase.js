const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const pool = require('../config/db');

// Default Seed Accounts:
// 1. Super Admin: settlo@gmail.com / 123456
// 2. Bank Owner: marcus.vance@cba.com.au / 123456
// 3. Bank Employee: sarah.jenkins@cba.com.au / 123456
const seedSuperAdmin = async () => {
    const rounds = Number(process.env.BCRYPT_ROUNDS || 12);
    const plainPassword = '123456';

    const defaultAccounts = [
        {
            id: 'u_settlo_superadmin',
            email: 'settlo@gmail.com',
            name: 'Super Admin',
            roleName: 'Super Admin',
            role: 'Super Admin',
            roleType: 'admin'
        },
        {
            id: 'u_cba_marcus',
            email: 'marcus.vance@cba.com.au',
            name: 'Marcus Vance',
            roleName: 'Admin',
            role: 'Bank Approver',
            roleType: 'manager'
        },
        {
            id: 'u_cba_sarah',
            email: 'sarah.jenkins@cba.com.au',
            name: 'Sarah Jenkins',
            roleName: 'User',
            role: 'Bank Employee (Maker)',
            roleType: 'employee'
        },
        {
            id: 'u_cba_david',
            email: 'david.miller@cba.com.au',
            name: 'David Miller',
            roleName: 'User',
            role: 'Credit Underwriter',
            roleType: 'employee'
        },
        {
            id: 'u_cba_settlo_lead',
            email: 'compliance@cba.com.au',
            name: 'Settlo Admin',
            roleName: 'Admin',
            role: 'APRA Compliance Lead',
            roleType: 'admin'
        },
        {
            id: 'u_cba_alex',
            email: 'alex.morgan@cba.com.au',
            name: 'Alex Morgan',
            roleName: 'User',
            role: 'Operations Squad Lead',
            roleType: 'employee'
        }
    ];

    try {
        const hashedPassword = await bcrypt.hash(plainPassword, rounds);

        for (const acc of defaultAccounts) {
            let roleRes = await pool.query(
                `SELECT id FROM roles WHERE LOWER(role_name) = LOWER($1) LIMIT 1`,
                [acc.roleName]
            );

            let roleId = roleRes.rows[0]?.id;
            if (!roleId) {
                const newRole = await pool.query(
                    `INSERT INTO roles (role_name, description, is_active) VALUES ($1, $2, TRUE) RETURNING id`,
                    [acc.roleName, `${acc.roleName} access permissions`]
                );
                roleId = newRole.rows[0].id;
            }

            let userRes = await pool.query(
                `SELECT id FROM users WHERE LOWER(email) = LOWER($1)`,
                [acc.email]
            );

            let userId;
            if (userRes.rowCount === 0) {
                const insertRes = await pool.query(
                    `INSERT INTO users (id, name, email, password, role, role_type, is_active) VALUES ($1, $2, $3, $4, $5, $6, TRUE) RETURNING id`,
                    [acc.id, acc.name, acc.email, hashedPassword, acc.role, acc.roleType]
                );
                userId = insertRes.rows[0].id;
                console.log(`Default ${acc.role} created: ${acc.email}`);
            } else {
                userId = userRes.rows[0].id;
                await pool.query(
                    `UPDATE users SET password = $1, is_active = TRUE, role = $2, role_type = $3, updated_at = NOW() WHERE id = $4`,
                    [hashedPassword, acc.role, acc.roleType, userId]
                );
                console.log(`Default ${acc.role} verified: ${acc.email}`);
            }

            if (userId && roleId) {
                await pool.query(
                    `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT (user_id, role_id) DO NOTHING`,
                    [userId, roleId]
                );
            }

            if (userId) {
                await pool.query(
                    `INSERT INTO user_settings (user_id, theme, button_color) VALUES ($1, 'system', '#075bb9') ON CONFLICT (user_id) DO NOTHING`,
                    [userId]
                );
            }
            console.log(`Account ready: ${acc.role} (${acc.email})`);
        }
    } catch (err) {
        console.error('Error verifying default accounts:', err.message);
    }
};

const initDatabase = async () => {
    try {
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
            console.log('Document Management schema applied successfully');
        }

        await seedSuperAdmin();
    } catch (error) {
        console.error('Database initialization failed:', error);
        throw error;
    }
};

module.exports = initDatabase;
module.exports.seedSuperAdmin = seedSuperAdmin;
