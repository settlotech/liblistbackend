/**
 * clearDatabase.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Truncates ALL tables in both schemas (document_management + public),
 * re-seeds the reference data (operations, modules, roles, permissions),
 * and re-creates the Super Admin user from .env.
 *
 * Usage:
 *   node scripts/clearDatabase.js
 *
 * ⚠️  DESTRUCTIVE – all rows will be permanently deleted.
 */

'use strict';

const pool    = require('../config/db');
const bcrypt  = require('bcryptjs');
require('dotenv').config();

// ─── 1. Truncate all tables (order respects FK deps) ──────────────────────────
const TRUNCATE_SQL = `
-- document_management schema (children first)
TRUNCATE TABLE
    document_management.user_pinned_policies,
    document_management.document_import_jobs,
    document_management.document_activity_logs,
    document_management.document_references,
    document_management.document_annotations,
    document_management.document_version_changes,
    document_management.document_version_sections,
    document_management.document_section_versions,
    document_management.document_versions,
    document_management.document_assets,
    document_management.document_sections,
    document_management.policy_user_access,
    document_management.documents,
    document_management.libraries,
    document_management.document_templates
CASCADE;

-- public schema (children first, keep roles/modules/operations for re-seed)
TRUNCATE TABLE
    public.notifications,
    public.user_fcm_tokens,
    public.user_request,
    public.password_reset_tokens,
    public.user_settings,
    public.refresh_tokens,
    public.role_permissions,
    public.user_roles,
    public.task_assignee_group_members,
    public.task_assignee_groups,
    public.task_assignees,
    public.task_logs,
    public.task_pins,
    public.task_participants,
    public.tasks,
    public.users,
    public.modules,
    public.operations,
    public.roles
CASCADE;
`;

// ─── 2. Re-seed reference data ─────────────────────────────────────────────────
const SEED_SQL = `
INSERT INTO public.operations (operation_name, display_name) VALUES
    ('create',   'Create'),
    ('read',     'Read'),
    ('update',   'Update'),
    ('delete',   'Delete'),
    ('export',   'Export'),
    ('import',   'Import'),
    ('approval', 'Approval')
ON CONFLICT (operation_name) DO NOTHING;

INSERT INTO public.modules (module_name, display_name, is_active) VALUES
    ('users',        'User Management',              TRUE),
    ('roles',        'Role Management',              TRUE),
    ('permissions',  'Permission Management',        TRUE),
    ('userrole',     'User Role Management',         TRUE),
    ('usersrequest', 'New User Request Management',  TRUE),
    ('templates',    'Template Management',          TRUE),
    ('libraries',    'Library Management',           TRUE),
    ('policy_access','Policy Access Control',        TRUE),
    ('documents',    'Policy & Document Management', TRUE)
ON CONFLICT (module_name) DO UPDATE
    SET display_name = EXCLUDED.display_name,
        is_active    = EXCLUDED.is_active;

INSERT INTO public.roles (role_name, description, is_active) VALUES
    ('Super Admin', 'Full unrestricted access to all modules and operations', TRUE),
    ('Admin',       'Administrator access with permission to manage users and roles', TRUE),
    ('User',        'Standard user with basic access', TRUE)
ON CONFLICT (role_name) DO NOTHING;

-- Super Admin -> all permissions
INSERT INTO public.role_permissions (role_id, module_id, operation_id)
SELECT r.id, m.id, o.id
FROM   public.roles r
CROSS  JOIN public.modules m
CROSS  JOIN public.operations o
WHERE  r.role_name = 'Super Admin'
ON CONFLICT (role_id, module_id, operation_id) DO NOTHING;

-- Admin -> users / roles / permissions (full CRUD)
INSERT INTO public.role_permissions (role_id, module_id, operation_id)
SELECT r.id, m.id, o.id
FROM   public.roles r
CROSS  JOIN public.modules m
CROSS  JOIN public.operations o
WHERE  r.role_name  = 'Admin'
  AND  m.module_name IN ('users', 'roles', 'permissions')
ON CONFLICT (role_id, module_id, operation_id) DO NOTHING;

-- Admin -> read-only on policy_access
INSERT INTO public.role_permissions (role_id, module_id, operation_id)
SELECT r.id, m.id, o.id
FROM   public.roles r
CROSS  JOIN public.modules m
CROSS  JOIN public.operations o
WHERE  r.role_name      = 'Admin'
  AND  m.module_name    = 'policy_access'
  AND  o.operation_name = 'read'
ON CONFLICT (role_id, module_id, operation_id) DO NOTHING;
`;

// ─── 3. Re-seed Super Admin user ───────────────────────────────────────────────
const seedSuperAdmin = async (client) => {
    const email    = process.env.SUPER_ADMIN_EMAIL;
    const password = process.env.SUPER_ADMIN_PASSWORD;
    const name     = process.env.SUPER_ADMIN_NAME;
    const rounds   = Number(process.env.BCRYPT_ROUNDS) || 10;

    if (!email || !password || !name) {
        throw new Error('SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD / SUPER_ADMIN_NAME must be set in .env');
    }

    const roleRes = await client.query(
        `SELECT id FROM public.roles WHERE role_name = 'Super Admin'`
    );
    const roleId = roleRes.rows[0].id;

    const hashedPassword = await bcrypt.hash(password, rounds);

    const userRes = await client.query(
        `INSERT INTO public.users (name, email, password, is_active)
         VALUES ($1, $2, $3, TRUE)
         ON CONFLICT (email)
         DO UPDATE SET
             name       = EXCLUDED.name,
             password   = EXCLUDED.password,
             is_active  = TRUE,
             updated_at = NOW()
         RETURNING id`,
        [name, email, hashedPassword]
    );
    const userId = userRes.rows[0].id;

    await client.query(
        `INSERT INTO public.user_roles (user_id, role_id)
         VALUES ($1, $2)
         ON CONFLICT (user_id, role_id) DO NOTHING`,
        [userId, roleId]
    );

    await client.query(
        `INSERT INTO public.user_settings (user_id, theme, button_color)
         VALUES ($1, 'system', '#075bb9')
         ON CONFLICT (user_id) DO NOTHING`,
        [userId]
    );

    console.log(`  ✔  Super Admin seeded: ${email}`);
};

// ─── Main ───────────────────────────────────────────────────────────────────────
const main = async () => {
    const client = await pool.connect();
    try {
        console.log('\n⚠️  Clearing database: demoliblist\n');

        await client.query('BEGIN');

        console.log('  → Truncating all tables...');
        await client.query(TRUNCATE_SQL);
        console.log('  ✔  All tables cleared.');

        console.log('  → Re-seeding reference data (roles, modules, operations, permissions)...');
        await client.query(SEED_SQL);
        console.log('  ✔  Reference data seeded.');

        console.log('  → Seeding Super Admin user...');
        await seedSuperAdmin(client);

        await client.query('COMMIT');

        console.log('\n✅  Database cleared and re-seeded successfully.\n');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('\n❌  Error during database clear:', err.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
};

main();
