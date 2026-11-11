const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/appError');
const { sendSuccess } = require('../utils/response');
const libraryModel = require('../models/library.model');
const activityModel = require('../models/activity.model');

const createLibrary = asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    console.log("userId ==> ", userId);
    const { parent_library_id, library_name, description, display_order } = req.body;
    console.log("req.body ==> ", req.body);

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
    const { id } = req.params;

    if (id) {
        const root = await libraryModel.findById(id);
        if (!root) {
            throw new AppError('Library not found.', 404);
        }
    }

    const tree = await libraryModel.getHierarchy(id || null);
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

module.exports = {
    createLibrary,
    getLibraryById,
    getAllLibraries,
    updateLibrary,
    deleteLibrary,
    getLibraryHierarchy,
    moveLibrary,
};
