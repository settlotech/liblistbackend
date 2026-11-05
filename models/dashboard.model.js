const pool = require('../config/db');

const resolveTimeInterval = (timeRange) => {
    switch (timeRange) {
        case '7d': return '7 days';
        case '30d': return '30 days';
        case '90d': return '90 days';
        case 'all': return '365 days';
        default: return '30 days';
    }
};


const getKpis = async ({ departmentId, timeRange = '30d' }) => {
    const deptParam = departmentId && departmentId !== 'all' ? departmentId : null;
    const timeFilter = resolveTimeInterval(timeRange);

 
    const policyQuery = deptParam
        ? `SELECT 
             COUNT(*) AS total,
             COUNT(*) FILTER (WHERE status = 'active') AS active,
             COUNT(*) FILTER (WHERE status = 'draft' OR status = 'pending_approval') AS draft,
             COUNT(*) FILTER (WHERE is_masked = TRUE) AS masked
           FROM policies WHERE department_id = $1`
        : `SELECT 
             COUNT(*) AS total,
             COUNT(*) FILTER (WHERE status = 'active') AS active,
             COUNT(*) FILTER (WHERE status = 'draft' OR status = 'pending_approval') AS draft,
             COUNT(*) FILTER (WHERE is_masked = TRUE) AS masked
           FROM policies`;

    const policyParams = deptParam ? [deptParam] : [];
    const policyRes = await pool.query(policyQuery, policyParams);
    const policyStats = policyRes.rows[0] || {};

    
    let mcQuery = `
        SELECT 
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status = 'pending') AS pending,
          COUNT(*) FILTER (WHERE status = 'approved') AS approved,
          COUNT(*) FILTER (WHERE status = 'rejected') AS rejected,
          COALESCE(
            ROUND(AVG(EXTRACT(EPOCH FROM (reviewed_at - created_at)) / 3600) 
            FILTER (WHERE reviewed_at IS NOT NULL)::numeric, 1),
            0
          ) AS avg_turnaround_hours
        FROM maker_checker_requests
        WHERE created_at >= NOW() - INTERVAL '${timeFilter}'
    `;
    const mcParams = [];
    if (deptParam) {
        mcQuery += ` AND (department_name = (SELECT name FROM departments WHERE id = $1 LIMIT 1) 
                     OR policy_id IN (SELECT id FROM policies WHERE department_id = $1))`;
        mcParams.push(deptParam);
    }
    const mcRes = await pool.query(mcQuery, mcParams);
    const mcStats = mcRes.rows[0] || {};

    // 3. APRA CPS 234 Compliance Tasks KPI
    let tasksRes;
    try {
        const taskQuery = `
            SELECT 
              COUNT(*) AS total,
              COUNT(*) FILTER (WHERE status = 'completed') AS completed,
              COUNT(*) FILTER (WHERE status = 'in_progress') AS in_progress,
              COUNT(*) FILTER (WHERE status = 'pending') AS pending
            FROM tasks
        `;
        tasksRes = await pool.query(taskQuery);
    } catch (_) {
        tasksRes = { rows: [{ total: 0, completed: 0, in_progress: 0, pending: 0 }] };
    }
    const taskStats = tasksRes.rows[0] || {};
    const totalTasks = parseInt(taskStats.total, 10) || 0;
    const completedTasks = parseInt(taskStats.completed, 10) || 0;
    const complianceRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 100;

    // 4. Users & Pending Signups KPI
    let userStats = { total_active: 0, total_users: 0 };
    try {
        const userRes = await pool.query(`
            SELECT 
              COUNT(*) AS total_users,
              COUNT(*) FILTER (WHERE is_active = TRUE) AS total_active
            FROM users
        `);
        userStats = userRes.rows[0] || userStats;
    } catch (_) {}

    let userRequestsStats = { total: 0, pending: 0, approved: 0, rejected: 0 };
    try {
        const reqRes = await pool.query(`
            SELECT 
              COUNT(*) AS total,
              COUNT(*) FILTER (WHERE status = 'pending') AS pending,
              COUNT(*) FILTER (WHERE status = 'approved') AS approved,
              COUNT(*) FILTER (WHERE status = 'rejected') AS rejected
            FROM user_request
        `);
        if (reqRes.rows[0]) {
            userRequestsStats = {
                total: parseInt(reqRes.rows[0].total, 10) || 0,
                pending: parseInt(reqRes.rows[0].pending, 10) || 0,
                approved: parseInt(reqRes.rows[0].approved, 10) || 0,
                rejected: parseInt(reqRes.rows[0].rejected, 10) || 0
            };
        }
    } catch (_) {}

    return {
        policies: {
            total: parseInt(policyStats.total, 10) || 0,
            active: parseInt(policyStats.active, 10) || 0,
            draft: parseInt(policyStats.draft, 10) || 0,
            masked: parseInt(policyStats.masked, 10) || 0
        },
        makerChecker: {
            total: parseInt(mcStats.total, 10) || 0,
            pending: parseInt(mcStats.pending, 10) || 0,
            approved: parseInt(mcStats.approved, 10) || 0,
            rejected: parseInt(mcStats.rejected, 10) || 0,
            avgTurnaroundHours: parseFloat(mcStats.avg_turnaround_hours) || 0
        },
        compliance: {
            totalTasks,
            completedTasks,
            inProgressTasks: parseInt(taskStats.in_progress, 10) || 0,
            pendingTasks: parseInt(taskStats.pending, 10) || 0,
            complianceRate
        },
        access: {
            totalUsers: parseInt(userStats.total_users, 10) || 0,
            activeUsers: parseInt(userStats.total_active, 10) || 0,
            pendingSignups: userRequestsStats.pending
        },
        userRequests: userRequestsStats
    };
};

 
const getMakerCheckerAnalytics = async ({ departmentId }) => {
    const deptParam = departmentId && departmentId !== 'all' ? departmentId : null;

    // 1. SLA Aging buckets for pending reviews
    let agingQuery = `
        SELECT 
          COUNT(*) FILTER (WHERE NOW() - created_at < INTERVAL '12 hours') AS under_12h,
          COUNT(*) FILTER (WHERE NOW() - created_at >= INTERVAL '12 hours' AND NOW() - created_at < INTERVAL '24 hours') AS between_12_24h,
          COUNT(*) FILTER (WHERE NOW() - created_at >= INTERVAL '24 hours' AND NOW() - created_at < INTERVAL '48 hours') AS between_24_48h,
          COUNT(*) FILTER (WHERE NOW() - created_at >= INTERVAL '48 hours') AS breached_48h
        FROM maker_checker_requests
        WHERE status = 'pending'
    `;
    const agingParams = [];
    if (deptParam) {
        agingQuery += ` AND (department_name = (SELECT name FROM departments WHERE id = $1 LIMIT 1) 
                         OR policy_id IN (SELECT id FROM policies WHERE department_id = $1))`;
        agingParams.push(deptParam);
    }
    const agingRes = await pool.query(agingQuery, agingParams);
    const agingStats = agingRes.rows[0] || {};

    // 2. Pending items by department
    const deptPendingQuery = `
        SELECT 
          COALESCE(department_name, 'General Governance') AS department,
          COUNT(*) AS count
        FROM maker_checker_requests
        WHERE status = 'pending'
        GROUP BY department_name
        ORDER BY count DESC
        LIMIT 6
    `;
    const deptPendingRes = await pool.query(deptPendingQuery);

    // 3. Recent 5 Maker-Checker items
    let recentQuery = `
        SELECT id, policy_title, department_name, maker_name, checker_name, status, created_at, reviewed_at
        FROM maker_checker_requests
    `;
    const recentParams = [];
    if (deptParam) {
        recentQuery += ` WHERE (department_name = (SELECT name FROM departments WHERE id = $1 LIMIT 1) 
                          OR policy_id IN (SELECT id FROM policies WHERE department_id = $1))`;
        recentParams.push(deptParam);
    }
    recentQuery += ` ORDER BY created_at DESC LIMIT 6`;
    const recentRes = await pool.query(recentQuery, recentParams);

    return {
        aging: {
            under12h: parseInt(agingStats.under_12h, 10) || 0,
            between12And24h: parseInt(agingStats.between_12_24h, 10) || 0,
            between24And48h: parseInt(agingStats.between_24_48h, 10) || 0,
            breachedOver48h: parseInt(agingStats.breached_48h, 10) || 0
        },
        pendingByDepartment: deptPendingRes.rows.map(r => ({
            department: r.department,
            count: parseInt(r.count, 10)
        })),
        recentActivity: recentRes.rows
    };
};

 
const getPolicyLifecycleMetrics = async () => {
    // 1. Policies count & status breakdown per Department
    const deptBreakdownQuery = `
        SELECT 
          d.id AS department_id,
          d.name AS department_name,
          d.icon,
          COUNT(p.id) AS total_policies,
          COUNT(p.id) FILTER (WHERE p.status = 'active') AS active_policies,
          COUNT(p.id) FILTER (WHERE p.is_masked = TRUE) AS masked_policies
        FROM departments d
        LEFT JOIN policies p ON p.department_id = d.id
        GROUP BY d.id, d.name, d.icon, d.sort_order
        ORDER BY d.sort_order ASC, total_policies DESC
    `;
    const deptRes = await pool.query(deptBreakdownQuery);

    // 2. Staleness check: policies not updated in > 180 days
    const staleRes = await pool.query(`
        SELECT 
          COUNT(*) AS stale_count
        FROM policies
        WHERE updated_at < NOW() - INTERVAL '180 days'
    `);
    const staleCount = parseInt(staleRes.rows[0]?.stale_count, 10) || 0;

    // 3. Total version snapshots
    let versionCount = 0;
    try {
        const verRes = await pool.query(`SELECT COUNT(*) AS total FROM policy_versions`);
        versionCount = parseInt(verRes.rows[0]?.total, 10) || 0;
    } catch (_) {}

    return {
        departmentDistribution: deptRes.rows.map(r => ({
            id: r.department_id,
            name: r.department_name,
            icon: r.icon,
            total: parseInt(r.total_policies, 10) || 0,
            active: parseInt(r.active_policies, 10) || 0,
            masked: parseInt(r.masked_policies, 10) || 0
        })),
        stalePoliciesCount: staleCount,
        totalVersionsSnapshot: versionCount
    };
};

 
const getChangeActivityTimeline = async (days = 14) => {
    const safeDays = Math.min(Math.max(parseInt(days, 10) || 14, 7), 90);

    const trendQuery = `
        SELECT 
          TO_CHAR(DATE(timestamp), 'YYYY-MM-DD') AS log_date,
          COUNT(*) AS total_events,
          COUNT(*) FILTER (WHERE action IN ('CREATED', 'CONFIGURED')) AS modifications,
          COUNT(*) FILTER (WHERE action IN ('APPROVED', 'ACTIVATED')) AS approvals,
          COUNT(*) FILTER (WHERE action IN ('REJECTED', 'ARCHIVED', 'MASKED')) AS governance_actions
        FROM change_logs
        WHERE timestamp >= NOW() - INTERVAL '${safeDays} days'
        GROUP BY DATE(timestamp)
        ORDER BY DATE(timestamp) ASC
    `;
    const trendRes = await pool.query(trendQuery);

    // Recent 8 audit logs
    const recentLogsQuery = `
        SELECT id, entity_type, entity_id, user_name, action, section_name, details, timestamp
        FROM change_logs
        ORDER BY timestamp DESC
        LIMIT 8
    `;
    const recentLogsRes = await pool.query(recentLogsQuery);

    return {
        daysAnalyzed: safeDays,
        dailyTrend: trendRes.rows,
        recentLogs: recentLogsRes.rows
    };
};

 
const getOperationalMetrics = async ({ departmentId }) => {
    let sql = `
        SELECT om.*, d.name AS department_name
        FROM operational_metrics om
        LEFT JOIN departments d ON d.id = om.department_id
    `;
    const params = [];
    if (departmentId && departmentId !== 'all') {
        sql += ` WHERE om.department_id = $1`;
        params.push(departmentId);
    }
    sql += ` ORDER BY om.sla_status ASC, om.updated_at DESC LIMIT 10`;

    const result = await pool.query(sql, params);

    const statusCounts = { optimal: 0, attention: 0, breached: 0 };
    result.rows.forEach(r => {
        const status = (r.sla_status || 'optimal').toLowerCase();
        if (statusCounts[status] !== undefined) {
            statusCounts[status]++;
        }
    });

    return {
        statusCounts,
        items: result.rows
    };
};

module.exports = {
    getKpis,
    getMakerCheckerAnalytics,
    getPolicyLifecycleMetrics,
    getChangeActivityTimeline,
    getOperationalMetrics,
    resolveTimeInterval
};
