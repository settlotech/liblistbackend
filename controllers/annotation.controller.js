const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/appError');
const { sendSuccess } = require('../utils/response');
const annotationModel = require('../models/annotation.model');
const documentModel = require('../models/document.model');
const sectionModel = require('../models/section.model');
const assetModel = require('../models/asset.model');
const activityModel = require('../models/activity.model');
const { validateAnchorData } = require('../services/annotation.service');

const createAnnotation = asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    const {
        document_id,
        section_id,
        asset_id,
        annotation_type,
        category,
        anchor_data,
        annotation_text,
        reference_code,
        reference_id,
    } = req.body;

    const document = await documentModel.findById(document_id);
    if (!document) {
        throw new AppError('Document not found.', 404);
    }

    if (section_id) {
        const section = await sectionModel.findById(section_id);
        if (!section || section.document_id !== document_id) {
            throw new AppError('Specified section does not belong to this document.', 400);
        }
    }

    if (asset_id) {
        const asset = await assetModel.findById(asset_id);
        if (!asset || asset.document_id !== document_id) {
            throw new AppError('Specified asset does not belong to this document.', 400);
        }
    }

    const normalizedAnchorData = validateAnchorData(annotation_type, anchor_data);

    const annotation = await annotationModel.create({
        document_id,
        section_id,
        asset_id,
        annotation_type,
        category,
        anchor_data: normalizedAnchorData,
        annotation_text,
        reference_code,
        reference_id,
        created_by: userId,
    });

    await activityModel.logActivity({
        document_id,
        library_id: document.library_id,
        activity_type: 'ANNOTATION_CREATED',
        entity_type: 'annotation',
        entity_id: annotation.id,
        description: `New ${annotation_type} annotation created.`,
        metadata: { category, reference_code },
        actor_id: userId,
    });

    return sendSuccess(res, 'Annotation created successfully', annotation, 201);
});

const getAnnotationById = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const annotation = await annotationModel.findById(id);

    if (!annotation) {
        throw new AppError('Annotation not found.', 404);
    }

    return sendSuccess(res, 'Annotation retrieved successfully', annotation);
});

const getAnnotationsByDocument = asyncHandler(async (req, res) => {
    const { documentId } = req.params;
    const { annotation_type, category, status, reference_code, page = 1, limit = 50 } = req.query;

    const document = await documentModel.findById(documentId);
    if (!document) {
        throw new AppError('Document not found.', 404);
    }

    const offset = (page - 1) * limit;

    const { annotations, total } = await annotationModel.findByDocumentId(documentId, {
        annotation_type,
        category,
        status,
        reference_code,
        limit: Number(limit),
        offset,
    });

    const totalPages = Math.ceil(total / limit) || 1;

    return sendSuccess(res, 'Document annotations retrieved successfully', annotations, 200, {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages,
    });
});

const getAnnotationsBySection = asyncHandler(async (req, res) => {
    const { sectionId } = req.params;

    const section = await sectionModel.findById(sectionId);
    if (!section) {
        throw new AppError('Section not found.', 404);
    }

    const annotations = await annotationModel.findBySectionId(sectionId);
    return sendSuccess(res, 'Section annotations retrieved successfully', annotations);
});

const getAnnotationsByReferenceCode = asyncHandler(async (req, res) => {
    const { code } = req.params;
    const annotations = await annotationModel.findByReferenceCode(code);
    return sendSuccess(res, 'Annotations by reference code retrieved successfully', annotations);
});

const updateAnnotation = asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    const { id } = req.params;

    const existing = await annotationModel.findById(id);
    if (!existing) {
        throw new AppError('Annotation not found.', 404);
    }

    let payload = { ...req.body };
    if (payload.anchor_data) {
        payload.anchor_data = validateAnchorData(existing.annotation_type, payload.anchor_data);
    }

    const updated = await annotationModel.update(id, payload, userId);

    await activityModel.logActivity({
        document_id: existing.document_id,
        activity_type: 'ANNOTATION_UPDATED',
        entity_type: 'annotation',
        entity_id: id,
        description: 'Annotation was updated.',
        actor_id: userId,
    });

    return sendSuccess(res, 'Annotation updated successfully', updated);
});

const deleteAnnotation = asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    const { id } = req.params;

    const existing = await annotationModel.findById(id);
    if (!existing) {
        throw new AppError('Annotation not found.', 404);
    }

    const deleted = await annotationModel.softDelete(id, userId);

    await activityModel.logActivity({
        document_id: existing.document_id,
        activity_type: 'ANNOTATION_DELETED',
        entity_type: 'annotation',
        entity_id: id,
        description: 'Annotation was deleted.',
        actor_id: userId,
    });

    return sendSuccess(res, 'Annotation deleted successfully', deleted);
});

module.exports = {
    createAnnotation,
    getAnnotationById,
    getAnnotationsByDocument,
    getAnnotationsBySection,
    getAnnotationsByReferenceCode,
    updateAnnotation,
    deleteAnnotation,
};
