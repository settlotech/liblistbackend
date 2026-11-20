const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/appError');
const { sendSuccess } = require('../utils/response');
const libraryModel = require('../models/library.model');
const activityModel = require('../models/activity.model');
const { sendNotificationToMany, sendNotificationToSingle } = require('../services/notification.service');
const rbacModel = require('../models/rbac.model');
const pool = require('../config/db');

const createLibrary = asyncHandler(async (req, res) => {
    const userId = req.user?.id; 
    const { parent_library_id, library_name, description, display_order } = req.body;
     
    if (parent_library_id) {
        const parent = await libraryModel.findById(parent_library_id);
        if (!parent) {
            throw new AppError('Specified parent library does not exist.', 404);
        }
    }

    const library = await libraryModel.create({
        parent_library_id,
        library_name,
        description,
        display_order,
        created_by: userId,
        updated_by: userId,
    });

    await activityModel.logActivity({
        library_id: library.id,
        activity_type: 'LIBRARY_CREATED',
        entity_type: 'library',
        entity_id: library.id,
        description: `Library '${library.library_name}' was created.`,
        actor_id: userId,
    });

    return sendSuccess(res, 'Library created successfully', library, 201);
});

const getLibraryById = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const library = await libraryModel.findById(id);

    if (!library) {
        throw new AppError('Library not found.', 404);
    }

    return sendSuccess(res, 'Library retrieved successfully', library);
});

const getAllLibraries = asyncHandler(async (req, res) => {
    const { parent_library_id, status, search, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const { libraries, total } = await libraryModel.findAll({
        parent_library_id,
        status,
        search,
        limit,
        offset,
    });

    const totalPages = Math.ceil(total / limit) || 1;

    return sendSuccess(res, 'Libraries retrieved successfully', libraries, 200, {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages,
    });
});

const updateLibrary = asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    const { id } = req.params;

    const existing = await libraryModel.findById(id);
    if (!existing) {
        throw new AppError('Library not found.', 404);
    }

    const updated = await libraryModel.update(id, req.body, userId);

    await activityModel.logActivity({
        library_id: id,
        activity_type: 'LIBRARY_UPDATED',
        entity_type: 'library',
        entity_id: id,
        description: `Library '${updated.library_name}' was updated.`,
        actor_id: userId,
    });

    return sendSuccess(res, 'Library updated successfully', updated);
});

const deleteLibrary = asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    const { id } = req.params;

    const existing = await libraryModel.findById(id);
    if (!existing) {
        throw new AppError('Library not found.', 404);
    }

    const deleted = await libraryModel.softDelete(id, userId);

    await activityModel.logActivity({
        library_id: id,
        activity_type: 'LIBRARY_DELETED',
        entity_type: 'library',
        entity_id: id,
        description: `Library '${existing.library_name}' was deleted.`,
        actor_id: userId,
    });

    return sendSuccess(res, 'Library deleted successfully', deleted);
});

const getLibraryHierarchy = asyncHandler(async (req, res) => {
    const id = req.params.id || req.query.id || null;

    if (id) {
        const root = await libraryModel.findById(id);
        if (!root) {
            throw new AppError('Library not found.', 404);
        }
    }

    const isDepartmentAdmin = (req.user?.roles || []).some(role => {
        const name = typeof role === 'string' ? role : role.role_name;
        return name?.trim().toLowerCase() === 'department admin';
    });
    const tree = isDepartmentAdmin
        ? await libraryModel.getDepartmentHierarchy(req.user.id, id)
        : await libraryModel.getHierarchy(id);
    return sendSuccess(res, 'Library hierarchy retrieved successfully', tree);
});

const moveLibrary = asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    const { id } = req.params;
    const { target_parent_library_id } = req.body;

    const library = await libraryModel.findById(id);
    if (!library) {
        throw new AppError('Library not found.', 404);
    }

    if (target_parent_library_id) {
        if (target_parent_library_id === id) {
            throw new AppError('A library cannot be moved under itself.', 400);
        }

        const targetParent = await libraryModel.findById(target_parent_library_id);
        if (!targetParent) {
            throw new AppError('Target parent library does not exist.', 404);
        }

        const wouldCauseCycle = await libraryModel.isDescendant(id, target_parent_library_id);
        if (wouldCauseCycle) {
            throw new AppError('Cannot move library into one of its own sub-libraries (cycle detected).', 400);
        }
    }

    const moved = await libraryModel.move(id, target_parent_library_id, userId);

    await activityModel.logActivity({
        library_id: id,
        activity_type: 'LIBRARY_MOVED',
        entity_type: 'library',
        entity_id: id,
        description: `Library '${moved.library_name}' was moved.`,
        metadata: { target_parent_library_id },
        actor_id: userId,
    });

    return sendSuccess(res, 'Library moved successfully', moved);
});

// POST /libraries/:id/request-removal — User requests library removal
const requestLibraryRemoval = asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    const { id } = req.params;
    const { reason } = req.body;

    const library = await libraryModel.findById(id);
    if (!library) throw new AppError('Library not found.', 404);

    const updated = await libraryModel.requestRemoval(id, userId, reason);

    await activityModel.logActivity({
        library_id: id,
        activity_type: 'LIBRARY_REMOVAL_REQUESTED',
        entity_type: 'library',
        entity_id: id,
        description: `Removal requested for library '${library.library_name}': ${reason || 'No reason provided.'}`,
        actor_id: userId,
    });

    // Notify Super Admins
    setImmediate(async () => {
        try {
            const superAdmins = await rbacModel.getUsersWithPermission('documents', 'approval').catch(() => []);
            const saRes = await pool.query("SELECT user_id AS id FROM public.user_roles WHERE role_id = 1");
            const saIds = Array.from(new Set([...superAdmins, ...saRes.rows.map(r => r.id)])).filter(saId => saId !== userId);

            if (saIds.length > 0) {
                await sendNotificationToMany({
                    userIds: saIds,
                    title: '⚠️ Library Removal Request',
                    body: `${req.user?.name || 'A user'} requested removal of library "${library.library_name}".`,
                    data: {
                        type: 'library_removal_requested',
                        library_id: id,
                        clickAction: '/change-management',
                    },
                    clickAction: '/change-management',
                });
            }
        } catch (err) {
            console.error('[Library] Failed to notify approvers:', err.message);
        }
    });

    return sendSuccess(res, 'Library removal requested successfully. Submitted to Change Management for review.', updated);
});

// PATCH /libraries/:id/review-removal — Super Admin approves or rejects removal
const reviewLibraryRemoval = asyncHandler(async (req, res) => {
    const user = req.user;
    const reviewerId = user?.id;
    const { id } = req.params;
    const { action, feedback } = req.body; // 'approve' | 'reject'

    if (!['approve', 'reject'].includes(action)) {
        throw new AppError('Action must be "approve" or "reject".', 400);
    }

    const isSuperAdmin = user?.isSuperAdmin || (user?.roles || []).some(r => {
        const name = typeof r === 'string' ? r : r.role_name;
        return name?.toLowerCase() === 'super admin';
    });
    const canApprove = isSuperAdmin || (user?.permissions || []).includes('documents:approval');
    if (!canApprove) {
        throw new AppError('You do not have permission to review library removal requests.', 403);
    }

    const library = await libraryModel.findById(id);
    if (!library) throw new AppError('Library not found.', 404);

    const updated = await libraryModel.reviewRemoval(id, reviewerId, { action, feedback });

    await activityModel.logActivity({
        library_id: id,
        activity_type: action === 'approve' ? 'LIBRARY_REMOVAL_APPROVED' : 'LIBRARY_REMOVAL_REJECTED',
        entity_type: 'library',
        entity_id: id,
        description: `Library removal ${action === 'approve' ? 'approved (status suspended)' : 'rejected'} for '${library.library_name}'.`,
        actor_id: reviewerId,
    });

    // Notify the requester
    if (library.removal_requested_by) {
        setImmediate(async () => {
            try {
                await sendNotificationToSingle({
                    userId: library.removal_requested_by,
                    title: action === 'approve' ? '✅ Library Removal Approved' : '❌ Library Removal Rejected',
                    body: action === 'approve'
                        ? `Your request to remove library "${library.library_name}" has been approved. The library has been suspended.`
                        : `Your request to remove library "${library.library_name}" was rejected. ${feedback || ''}`,
                    data: {
                        type: action === 'approve' ? 'library_removal_approved' : 'library_removal_rejected',
                        library_id: id,
                        clickAction: '/change-management',
                    },
                    clickAction: '/change-management',
                });
            } catch (err) {
                console.error('[Library] Failed to notify requester:', err.message);
            }
        });
    }

    return sendSuccess(res, `Library removal ${action === 'approve' ? 'approved and library suspended' : 'rejected'} successfully`, updated);
});

// GET /libraries/pending-removals — Get all pending library removals
const getPendingLibraryRemovals = asyncHandler(async (req, res) => {
    const removals = await libraryModel.getPendingRemovals();
    return sendSuccess(res, 'Pending library removals retrieved', removals);
});

module.exports = {
    createLibrary,
    getLibraryById,
    getAllLibraries,
    updateLibrary,
    deleteLibrary,
    getLibraryHierarchy,
    moveLibrary,
    requestLibraryRemoval,
    reviewLibraryRemoval,
    getPendingLibraryRemovals,
};
