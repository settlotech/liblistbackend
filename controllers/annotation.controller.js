const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/appError');
const { sendSuccess } = require('../utils/response');
const annotationModel = require('../models/annotation.model');
const documentModel = require('../models/document.model');

// GET /my-annotations (all notes/annotations created by current user)
const getMyAnnotations = asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    const { annotation_type, category, search, page = 1, limit = 20 } = req.query;

    const list = await annotationModel.findByUser(userId, {
        annotation_type: annotation_type || null,
        category: category || null,
        search: search || null,
        page,
        limit,
    });

    return sendSuccess(res, 'User annotations retrieved successfully', list.items, 200, list.pagination);
});

// GET /documents/:id/annotations
const getAnnotations = asyncHandler(async (req, res) => {
    const { id: documentId } = req.params;
    const { version_id, category, annotation_type } = req.query;
    const userId = req.user?.id; // Strictly fetch only the author's personal notes & annotations

    const annotations = await annotationModel.findByDocument(documentId, {
        version_id: version_id || null,
        category: category || null,
        annotation_type: annotation_type || null,
        user_id: userId || null,
    });

    return sendSuccess(res, 'Annotations retrieved successfully', annotations);
});

// POST /documents/:id/annotations
const createAnnotation = asyncHandler(async (req, res) => {
    const { id: documentId } = req.params;
    const user = req.user;
    const userId = user?.id;

    const document = await documentModel.findById(documentId);
    if (!document) throw new AppError('Document not found', 404);

    const {
        section_id,
        asset_id,
        version_id,
        annotation_type = 'TEXT',
        category = 'NOTES',
        anchor_data = {},
        annotation_text,
        label,
        color = '#0057B8',
        reference_code,
    } = req.body;

    if (!annotation_text || !annotation_text.trim()) {
        throw new AppError('Annotation/note text is required', 400);
    }

    const created = await annotationModel.create({
        document_id: documentId,
        section_id: section_id || null,
        asset_id: asset_id || null,
        version_id: version_id || document.live_version_id || document.current_version_id || null,
        annotation_type,
        category,
        anchor_data,
        annotation_text: annotation_text.trim(),
        label: label ? label.trim() : null,
        color,
        reference_code: reference_code || null,
        created_by: userId,
    });

    return sendSuccess(res, 'Annotation created successfully', created, 201);
});

// PUT /documents/:id/annotations/:annotationId
const updateAnnotation = asyncHandler(async (req, res) => {
    const { annotationId } = req.params;
    const user = req.user;
    const userId = user?.id;

    const existing = await annotationModel.findById(annotationId);
    if (!existing) throw new AppError('Annotation not found', 404);

    const isSuperAdmin = user?.isSuperAdmin || (user?.roles || []).some(r => {
        const name = typeof r === 'string' ? r : r.role_name;
        return name?.toLowerCase() === 'super admin';
    });

    if (!isSuperAdmin && existing.created_by && existing.created_by !== userId) {
        throw new AppError('You do not have permission to modify this annotation', 403);
    }

    const { annotation_text, label, color, status, anchor_data } = req.body;

    const updated = await annotationModel.update(annotationId, {
        annotation_text,
        label,
        color,
        status,
        anchor_data,
        updated_by: userId,
    });

    return sendSuccess(res, 'Annotation updated successfully', updated);
});

// DELETE /documents/:id/annotations/:annotationId
const deleteAnnotation = asyncHandler(async (req, res) => {
    const { annotationId } = req.params;
    const user = req.user;
    const userId = user?.id;

    const existing = await annotationModel.findById(annotationId);
    if (!existing) throw new AppError('Annotation not found', 404);

    const isSuperAdmin = user?.isSuperAdmin || (user?.roles || []).some(r => {
        const name = typeof r === 'string' ? r : r.role_name;
        return name?.toLowerCase() === 'super admin';
    });

    if (!isSuperAdmin && existing.created_by && existing.created_by !== userId) {
        throw new AppError('You do not have permission to delete this annotation', 403);
    }

    await annotationModel.softDelete(annotationId, userId);

    return sendSuccess(res, 'Annotation deleted successfully');
});

module.exports = {
    getMyAnnotations,
    getAnnotations,
    createAnnotation,
    updateAnnotation,
    deleteAnnotation,
};
