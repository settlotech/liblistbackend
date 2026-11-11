const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const activityModel = require('../models/activity.model');

const getDocumentActivity = asyncHandler(async (req, res) => {
    const { documentId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    const activities = await activityModel.findByDocumentId(documentId, {
        limit: Number(limit),
        offset,
    });

    return sendSuccess(res, 'Document activity logs retrieved successfully', activities);
});

const getLibraryActivity = asyncHandler(async (req, res) => {
    const { libraryId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    const activities = await activityModel.findByLibraryId(libraryId, {
        limit: Number(limit),
        offset,
    });

    return sendSuccess(res, 'Library activity logs retrieved successfully', activities);
});

const getUserActivity = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    const activities = await activityModel.findByUserId(userId, {
        limit: Number(limit),
        offset,
    });

    return sendSuccess(res, 'User activity logs retrieved successfully', activities);
});

const getAllActivity = asyncHandler(async (req, res) => {
    const {
        document_id,
        library_id,
        actor_id,
        activity_type,
        start_date,
        end_date,
        page = 1,
        limit = 50,
    } = req.query;

    const offset = (page - 1) * limit;

    const { activities, total } = await activityModel.findAll({
        document_id,
        library_id,
        actor_id,
        activity_type,
        start_date,
        end_date,
        limit: Number(limit),
        offset,
    });

    const totalPages = Math.ceil(total / limit) || 1;

    return sendSuccess(res, 'Activity logs retrieved successfully', activities, 200, {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages,
    });
});

module.exports = {
    getDocumentActivity,
    getLibraryActivity,
    getUserActivity,
    getAllActivity,
};
