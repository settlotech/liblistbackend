const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/auth.middleware');
const pool = require('../config/db');

router.use(authenticate);

router.get('/overview', async (req, res, next) => {
    try {
        const userId = req.user?.id;
        const isSuperAdmin = req.user?.isSuperAdmin === true ||
            (req.user?.role || '').toLowerCase() === 'super admin' ||
            (req.user?.role || '').toLowerCase() === 'super_admin' ||
            (Array.isArray(req.user?.roles) && req.user.roles.some(r => {
                const name = (typeof r === 'string' ? r : r.role_name || '').toLowerCase();
                return name === 'super admin' || name === 'super_admin';
            }));

        let stats = {};

        if (isSuperAdmin) {
            // ── SUPER ADMIN: System-Wide Global Metrics ──
            const docCounts = await pool.query(`
                SELECT 
                    COUNT(*)::int AS total_documents,
                    COUNT(CASE WHEN status = 'active' THEN 1 END)::int AS active_documents,
                    COUNT(CASE WHEN status = 'draft' THEN 1 END)::int AS draft_documents,
                    COUNT(CASE WHEN status = 'suspended' THEN 1 END)::int AS suspended_documents,
                    COUNT(CASE WHEN has_pending_revision = TRUE THEN 1 END)::int AS pending_revisions,
                    COUNT(CASE WHEN pending_removal = TRUE THEN 1 END)::int AS pending_removals
                FROM document_management.documents
                WHERE deleted_at IS NULL
            `).catch(() => ({ rows: [{}] }));

            const libCount = await pool.query(`
                SELECT COUNT(*)::int AS total_libraries 
                FROM document_management.libraries 
                WHERE deleted_at IS NULL
            `).catch(() => ({ rows: [{ total_libraries: 0 }] }));

            const userCount = await pool.query(`
                SELECT 
                    COUNT(*)::int AS total_users,
                    COUNT(CASE WHEN is_active = TRUE THEN 1 END)::int AS active_users
                FROM public.users
            `).catch(() => ({ rows: [{ total_users: 0, active_users: 0 }] }));

            const requestCount = await pool.query(`
                SELECT COUNT(*)::int AS pending_requests
                FROM public.user_request
                WHERE status = 'pending' AND is_used = FALSE
            `).catch(() => ({ rows: [{ pending_requests: 0 }] }));

            const templateCount = await pool.query(`
                SELECT COUNT(*)::int AS total_templates
                FROM document_management.document_templates
                WHERE deleted_at IS NULL AND is_active = TRUE
            `).catch(() => ({ rows: [{ total_templates: 0 }] }));

            const taskCounts = await pool.query(`
                SELECT 
                    COUNT(*)::int AS total_tasks,
                    COUNT(CASE WHEN LOWER(status) = 'completed' THEN 1 END)::int AS completed_tasks,
                    COUNT(CASE WHEN LOWER(status) NOT IN ('completed', 'cancelled') THEN 1 END)::int AS pending_tasks,
                    COUNT(CASE WHEN due_date < NOW() AND LOWER(status) NOT IN ('completed', 'cancelled') THEN 1 END)::int AS overdue_tasks
                FROM public.tasks
            `).catch(() => ({ rows: [{ total_tasks: 0, completed_tasks: 0, pending_tasks: 0, overdue_tasks: 0 }] }));

            const recentPolicies = await pool.query(`
                SELECT d.id, d.document_name, d.status, d.created_at, u.name as creator_name
                FROM document_management.documents d
                LEFT JOIN public.users u ON d.created_by = u.id
                WHERE d.deleted_at IS NULL
                ORDER BY d.created_at DESC
                LIMIT 5
            `).catch(() => ({ rows: [] }));

            const recentTasks = await pool.query(`
                SELECT t.id, t.task_seq, t.title, t.status, t.due_date, t.created_at, u.name as assigned_name
                FROM public.tasks t
                LEFT JOIN public.users u ON t.assigned_to = u.id
                ORDER BY t.created_at DESC
                LIMIT 5
            `).catch(() => ({ rows: [] }));

            stats = {
                isSuperAdmin: true,
                role: req.user?.role || 'Super Admin',
                userName: req.user?.name || 'Administrator',
                ...docCounts.rows[0],
                ...libCount.rows[0],
                ...userCount.rows[0],
                ...requestCount.rows[0],
                ...templateCount.rows[0],
                ...taskCounts.rows[0],
                recentPolicies: recentPolicies.rows || [],
                recentTasks: recentTasks.rows || []
            };
        } else {
            // ── REGULAR USER / ROLE-BASED METRICS ──
            const myDocsRes = await pool.query(`
                SELECT 
                    COUNT(CASE WHEN created_by = $1 THEN 1 END)::int AS my_policies,
                    COUNT(CASE WHEN created_by = $1 AND status = 'active' THEN 1 END)::int AS my_active_policies,
                    COUNT(CASE WHEN created_by = $1 AND status = 'draft' THEN 1 END)::int AS my_draft_policies,
                    COUNT(CASE WHEN status = 'active' THEN 1 END)::int AS total_active_policies,
                    COUNT(CASE WHEN status = 'draft' AND requested_by = $1 THEN 1 END)::int AS my_pending_approvals
                FROM document_management.documents
                WHERE deleted_at IS NULL
            `, [userId]).catch(() => ({ rows: [{}] }));

            const myTasksRes = await pool.query(`
                SELECT 
                    COUNT(CASE WHEN t.assigned_to = $1 OR EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = t.id AND ta.user_id = $1) THEN 1 END)::int AS my_assigned_tasks,
                    COUNT(CASE WHEN (t.assigned_to = $1 OR EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = t.id AND ta.user_id = $1)) AND LOWER(t.status) = 'completed' THEN 1 END)::int AS my_completed_tasks,
                    COUNT(CASE WHEN (t.assigned_to = $1 OR EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = t.id AND ta.user_id = $1)) AND LOWER(t.status) NOT IN ('completed', 'cancelled') THEN 1 END)::int AS my_pending_tasks,
                    COUNT(CASE WHEN (t.assigned_to = $1 OR EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = t.id AND ta.user_id = $1)) AND t.due_date < NOW() AND LOWER(t.status) NOT IN ('completed', 'cancelled') THEN 1 END)::int AS my_overdue_tasks,
                    COUNT(CASE WHEN t.created_by = $1 THEN 1 END)::int AS my_created_tasks
                FROM public.tasks t
            `, [userId]).catch(() => ({ rows: [{}] }));

            const myRecentPolicies = await pool.query(`
                SELECT d.id, d.document_name, d.status, d.created_at, u.name as creator_name
                FROM document_management.documents d
                LEFT JOIN public.users u ON d.created_by = u.id
                WHERE d.deleted_at IS NULL AND (d.created_by = $1 OR d.status = 'active')
                ORDER BY d.created_at DESC
                LIMIT 5
            `, [userId]).catch(() => ({ rows: [] }));

            const myRecentTasks = await pool.query(`
                SELECT t.id, t.task_seq, t.title, t.status, t.due_date, t.created_at, u.name as assigned_name
                FROM public.tasks t
                LEFT JOIN public.users u ON t.assigned_to = u.id
                WHERE (t.assigned_to = $1 OR t.created_by = $1 OR EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = t.id AND ta.user_id = $1))
                ORDER BY t.created_at DESC
                LIMIT 5
            `, [userId]).catch(() => ({ rows: [] }));

            stats = {
                isSuperAdmin: false,
                role: req.user?.role || 'User',
                userName: req.user?.name || 'User',
                ...myDocsRes.rows[0],
                ...myTasksRes.rows[0],
                recentPolicies: myRecentPolicies.rows || [],
                recentTasks: myRecentTasks.rows || []
            };
        }

        res.status(200).json({
            success: true,
            message: 'Dashboard metrics retrieved successfully',
            data: stats
        });
    } catch (err) {
        next(err);
    }
});

router.get('/maker-checker', async (req, res, next) => {
    try {
        const statsRes = await pool.query(`
            SELECT 
                COUNT(CASE WHEN status = 'draft' THEN 1 END)::int AS pending_review,
                COUNT(CASE WHEN status = 'active' THEN 1 END)::int AS approved,
                COUNT(CASE WHEN rejection_reason IS NOT NULL AND status = 'draft' THEN 1 END)::int AS rejected
            FROM document_management.documents
            WHERE deleted_at IS NULL
        `).catch(() => ({ rows: [{ pending_review: 0, approved: 0, rejected: 0 }] }));

        res.status(200).json({
            success: true,
            data: statsRes.rows[0]
        });
    } catch (err) {
        next(err);
    }
});

router.get('/activity-timeline', async (req, res, next) => {
    try {
        const days = parseInt(req.query.days, 10) || 14;
        const timelineRes = await pool.query(`
            SELECT 
                id,
                event_type,
                entity_type,
                entity_id,
                details,
                actor_id,
                created_at
            FROM document_management.document_activity_logs
            WHERE created_at >= NOW() - INTERVAL '1 day' * $1
            ORDER BY created_at DESC
            LIMIT 50
        `, [days]).catch(() => ({ rows: [] }));

        res.status(200).json({
            success: true,
            data: timelineRes.rows
        });
    } catch (err) {
        next(err);
    }
});


// ── Dashboard: Change Management Widget ──
// Returns role/user-based "Saved Drafts" and "In Review" lists
router.get('/change-management', async (req, res, next) => {
    try {
        const userId = req.user?.id;
        const isSuperAdmin = req.user?.isSuperAdmin === true ||
            (req.user?.role || '').toLowerCase() === 'super admin' ||
            (req.user?.role || '').toLowerCase() === 'super_admin' ||
            (Array.isArray(req.user?.roles) && req.user.roles.some(r => {
                const name = (typeof r === 'string' ? r : r.role_name || '').toLowerCase();
                return name === 'super admin' || name === 'super_admin';
            }));

        const canApprove = isSuperAdmin ||
            (Array.isArray(req.user?.permissionStrings) && req.user.permissionStrings.includes('documents:approval')) ||
            (Array.isArray(req.user?.permissions) && req.user.permissions.includes('documents:approval'));

        let savedDrafts = [];
        let inReview = [];
        let draftTotal = 0;
        let inReviewTotal = 0;

        if (isSuperAdmin || canApprove) {
            // ── SUPER ADMIN / APPROVER: See all system-wide drafts and in-review items ──
            const draftsRes = await pool.query(`
                SELECT
                    d.id,
                    d.document_name,
                    d.status,
                    d.has_pending_revision,
                    d.revision_status,
                    d.pending_revision_version,
                    v.version_number AS current_version_number,
                    d.updated_at,
                    l.library_name,
                    COALESCE(u.name, u2.name) AS author_name
                FROM document_management.documents d
                LEFT JOIN document_management.libraries l ON d.library_id = l.id
                LEFT JOIN public.users u ON d.requested_by = u.id
                LEFT JOIN public.users u2 ON d.created_by = u2.id
                LEFT JOIN document_management.document_versions v ON COALESCE(d.live_version_id, d.current_version_id) = v.id
                WHERE d.deleted_at IS NULL
                  AND (
                    d.status = 'draft'
                    OR (d.has_pending_revision = TRUE AND d.revision_status = 'draft')
                  )
                ORDER BY d.updated_at DESC
                LIMIT 20
            `).catch(() => ({ rows: [] }));

            const inReviewRes = await pool.query(`
                SELECT
                    d.id,
                    d.document_name,
                    d.status,
                    d.has_pending_revision,
                    d.revision_status,
                    d.pending_revision_version,
                    v.version_number AS current_version_number,
                    d.updated_at,
                    l.library_name,
                    COALESCE(u.name, u2.name) AS author_name
                FROM document_management.documents d
                LEFT JOIN document_management.libraries l ON d.library_id = l.id
                LEFT JOIN public.users u ON d.requested_by = u.id
                LEFT JOIN public.users u2 ON d.created_by = u2.id
                LEFT JOIN document_management.document_versions v ON COALESCE(d.live_version_id, d.current_version_id) = v.id
                WHERE d.deleted_at IS NULL
                  AND (
                    d.status IN ('pending', 'in_review')
                    OR (d.has_pending_revision = TRUE AND d.revision_status = 'pending_review')
                  )
                ORDER BY d.updated_at DESC
                LIMIT 20
            `).catch(() => ({ rows: [] }));

            // Count totals
            const draftCountRes = await pool.query(`
                SELECT COUNT(*)::int AS total FROM document_management.documents
                WHERE deleted_at IS NULL
                  AND (status = 'draft' OR (has_pending_revision = TRUE AND revision_status = 'draft'))
            `).catch(() => ({ rows: [{ total: 0 }] }));

            const inReviewCountRes = await pool.query(`
                SELECT COUNT(*)::int AS total FROM document_management.documents
                WHERE deleted_at IS NULL
                  AND (status IN ('pending','in_review') OR (has_pending_revision = TRUE AND revision_status = 'pending_review'))
            `).catch(() => ({ rows: [{ total: 0 }] }));

            savedDrafts = draftsRes.rows;
            inReview = inReviewRes.rows;
            draftTotal = draftCountRes.rows[0]?.total ?? 0;
            inReviewTotal = inReviewCountRes.rows[0]?.total ?? 0;

        } else {
            // ── REGULAR USER: See only their own drafts and in-review items ──
            const draftsRes = await pool.query(`
                SELECT
                    d.id,
                    d.document_name,
                    d.status,
                    d.has_pending_revision,
                    d.revision_status,
                    d.pending_revision_version,
                    v.version_number AS current_version_number,
                    d.updated_at,
                    l.library_name,
                    COALESCE(u.name, u2.name) AS author_name
                FROM document_management.documents d
                LEFT JOIN document_management.libraries l ON d.library_id = l.id
                LEFT JOIN public.users u ON d.requested_by = u.id
                LEFT JOIN public.users u2 ON d.created_by = u2.id
                LEFT JOIN document_management.document_versions v ON COALESCE(d.live_version_id, d.current_version_id) = v.id
                WHERE d.deleted_at IS NULL
                  AND (d.created_by = $1 OR d.requested_by = $1 OR d.pending_revision_by = $1)
                  AND (
                    d.status = 'draft'
                    OR (d.has_pending_revision = TRUE AND d.revision_status = 'draft')
                  )
                ORDER BY d.updated_at DESC
                LIMIT 20
            `, [userId]).catch(() => ({ rows: [] }));

            const inReviewRes = await pool.query(`
                SELECT
                    d.id,
                    d.document_name,
                    d.status,
                    d.has_pending_revision,
                    d.revision_status,
                    d.pending_revision_version,
                    v.version_number AS current_version_number,
                    d.updated_at,
                    l.library_name,
                    COALESCE(u.name, u2.name) AS author_name
                FROM document_management.documents d
                LEFT JOIN document_management.libraries l ON d.library_id = l.id
                LEFT JOIN public.users u ON d.requested_by = u.id
                LEFT JOIN public.users u2 ON d.created_by = u2.id
                LEFT JOIN document_management.document_versions v ON COALESCE(d.live_version_id, d.current_version_id) = v.id
                WHERE d.deleted_at IS NULL
                  AND (d.created_by = $1 OR d.requested_by = $1 OR d.pending_revision_by = $1)
                  AND (
                    d.status IN ('pending', 'in_review')
                    OR (d.has_pending_revision = TRUE AND d.revision_status = 'pending_review')
                  )
                ORDER BY d.updated_at DESC
                LIMIT 20
            `, [userId]).catch(() => ({ rows: [] }));

            const draftCountRes = await pool.query(`
                SELECT COUNT(*)::int AS total FROM document_management.documents
                WHERE deleted_at IS NULL
                  AND (created_by = $1 OR requested_by = $1 OR pending_revision_by = $1)
                  AND (status = 'draft' OR (has_pending_revision = TRUE AND revision_status = 'draft'))
            `, [userId]).catch(() => ({ rows: [{ total: 0 }] }));

            const inReviewCountRes = await pool.query(`
                SELECT COUNT(*)::int AS total FROM document_management.documents
                WHERE deleted_at IS NULL
                  AND (created_by = $1 OR requested_by = $1 OR pending_revision_by = $1)
                  AND (status IN ('pending','in_review') OR (has_pending_revision = TRUE AND revision_status = 'pending_review'))
            `, [userId]).catch(() => ({ rows: [{ total: 0 }] }));

            savedDrafts = draftsRes.rows;
            inReview = inReviewRes.rows;
            draftTotal = draftCountRes.rows[0]?.total ?? 0;
            inReviewTotal = inReviewCountRes.rows[0]?.total ?? 0;
        }

        res.status(200).json({
            success: true,
            message: 'Change management data retrieved successfully',
            data: {
                isSuperAdmin,
                canApprove,
                savedDrafts,
                inReview,
                draftTotal,
                inReviewTotal,
            }
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;

