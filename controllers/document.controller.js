const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/appError');
const { sendSuccess } = require('../utils/response');
const documentModel = require('../models/document.model');
const libraryModel = require('../models/library.model');
const activityModel = require('../models/activity.model');

const createDocument = asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    const { library_id, document_name, description, document_type, source_type } = req.body;

    const library = await libraryModel.findById(library_id);
    if (!library) {
        throw new AppError('Specified library does not exist.', 404);
    }

    const document = await documentModel.create({
        library_id,
        document_name,
        description,
        document_type,
        source_type,
        created_by: userId,
        updated_by: userId,
    });

    await activityModel.logActivity({
        document_id: document.id,
        library_id: document.library_id,
        activity_type: 'DOCUMENT_CREATED',
        entity_type: 'document',
        entity_id: document.id,
        description: `Document '${document.document_name}' was created.`,
        actor_id: userId,
    });

    return sendSuccess(res, 'Document created successfully', document, 201);
});

const getDocumentById = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const document = await documentModel.findById(id);

    if (!document) {
        throw new AppError('Document not found.', 404);
    }

    return sendSuccess(res, 'Document retrieved successfully', document);
});

const getAllDocuments = asyncHandler(async (req, res) => {
    const { library_id, status, document_type, search, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const { documents, total } = await documentModel.findAll({
        library_id,
        status,
        document_type,
        search,
        limit,
        offset,
    });

    const totalPages = Math.ceil(total / limit) || 1;

    return sendSuccess(res, 'Documents retrieved successfully', documents, 200, {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages,
    });
});

const getDocumentsByLibrary = asyncHandler(async (req, res) => {
    const { id: libraryId } = req.params;
    const { status, document_type, search, page = 1, limit = 20 } = req.query;

    const library = await libraryModel.findById(libraryId);
    if (!library) {
        throw new AppError('Library not found.', 404);
    }

    const offset = (page - 1) * limit;

    const { documents, total } = await documentModel.findAll({
        library_id: libraryId,
        status,
        document_type,
        search,
        limit,
        offset,
    });

    const totalPages = Math.ceil(total / limit) || 1;

    return sendSuccess(res, 'Library documents retrieved successfully', documents, 200, {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages,
    });
});

const updateDocument = asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    const { id } = req.params;

    const existing = await documentModel.findById(id);
    if (!existing) {
        throw new AppError('Document not found.', 404);
    }

    const updated = await documentModel.update(id, req.body, userId);

    await activityModel.logActivity({
        document_id: id,
        library_id: existing.library_id,
        activity_type: 'DOCUMENT_UPDATED',
        entity_type: 'document',
        entity_id: id,
        description: `Document '${updated.document_name}' details were updated.`,
        actor_id: userId,
    });

    return sendSuccess(res, 'Document updated successfully', updated);
});

const deleteDocument = asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    const { id } = req.params;

    const existing = await documentModel.findById(id);
    if (!existing) {
        throw new AppError('Document not found.', 404);
    }

    const deleted = await documentModel.softDelete(id, userId);

    await activityModel.logActivity({
        document_id: id,
        library_id: existing.library_id,
        activity_type: 'DOCUMENT_DELETED',
        entity_type: 'document',
        entity_id: id,
        description: `Document '${existing.document_name}' was deleted.`,
        actor_id: userId,
    });

    return sendSuccess(res, 'Document deleted successfully', deleted);
});

const moveDocument = asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    const { id } = req.params;
    const { target_library_id } = req.body;

    const document = await documentModel.findById(id);
    if (!document) {
        throw new AppError('Document not found.', 404);
    }

    const targetLibrary = await libraryModel.findById(target_library_id);
    if (!targetLibrary) {
        throw new AppError('Target library does not exist.', 404);
    }

    const moved = await documentModel.move(id, target_library_id, userId);

    await activityModel.logActivity({
        document_id: id,
        library_id: target_library_id,
        activity_type: 'DOCUMENT_MOVED',
        entity_type: 'document',
        entity_id: id,
        description: `Document '${moved.document_name}' moved to library '${targetLibrary.library_name}'.`,
        metadata: { from_library_id: document.library_id, to_library_id: target_library_id },
        actor_id: userId,
    });

    return sendSuccess(res, 'Document moved successfully', moved);
});

const searchDocuments = asyncHandler(async (req, res) => {
    const { q, library_id, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const { documents, total } = await documentModel.findAll({
        search: q,
        library_id,
        status: 'all',
        limit,
        offset,
    });

    const totalPages = Math.ceil(total / limit) || 1;

    return sendSuccess(res, 'Document search results retrieved successfully', documents, 200, {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages,
    });
});

const getDocumentMetadata = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const metadata = await documentModel.getCompleteMetadata(id);

    if (!metadata) {
        throw new AppError('Document not found.', 404);
    }

    return sendSuccess(res, 'Document metadata retrieved successfully', metadata);
});

module.exports = {
    createDocument,
    getDocumentById,
    getAllDocuments,
    getDocumentsByLibrary,
    updateDocument,
    deleteDocument,
    moveDocument,
    searchDocuments,
    getDocumentMetadata,
};
