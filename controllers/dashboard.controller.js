const {
    getKpis,
    getMakerCheckerAnalytics,
    getPolicyLifecycleMetrics,
    getChangeActivityTimeline,
    getOperationalMetrics
} = require('../models/dashboard.model');

 
const getDashboardOverview = async (req, res, next) => {
    try {
        const { department_id, time_range = '30d' } = req.query;

        const [
            kpis,
            makerChecker,
            policyLifecycle,
            activityTimeline,
            operationalSla
        ] = await Promise.all([
            getKpis({ departmentId: department_id, timeRange: time_range }),
            getMakerCheckerAnalytics({ departmentId: department_id }),
            getPolicyLifecycleMetrics(),
            getChangeActivityTimeline(time_range === '7d' ? 7 : time_range === '90d' ? 90 : 14),
            getOperationalMetrics({ departmentId: department_id })
        ]);

        res.status(200).json({
            success: true,
            timestamp: new Date().toISOString(),
            filters: {
                department_id: department_id || 'all',
                time_range
            },
            data: {
                kpis,
                makerChecker,
                policyLifecycle,
                activityTimeline,
                operationalSla
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * GET /api/dashboard/maker-checker
 * Sub-endpoint for 4-Eyes Maker-Checker approval and aging drill-down.
 */
const getMakerCheckerMetrics = async (req, res, next) => {
    try {
        const { department_id } = req.query;
        const data = await getMakerCheckerAnalytics({ departmentId: department_id });
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};

/**
 * GET /api/dashboard/activity-timeline
 * Sub-endpoint for change log audit timeline.
 */
const getActivityTimeline = async (req, res, next) => {
    try {
        const { days = 14 } = req.query;
        const data = await getChangeActivityTimeline(days);
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getDashboardOverview,
    getMakerCheckerMetrics,
    getActivityTimeline
};
