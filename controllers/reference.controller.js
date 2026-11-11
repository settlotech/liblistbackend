const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/appError');
const { sendSuccess } = require('../utils/response');
const referenceModel = require('../models/reference.model');
const documentModel = require('../models/document.model');

const createReference = asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    const { document_id, reference_code, title, description, source_type, target_url, metadata } = req.body;

    const document = await documentModel.findById(document_id);
    if (!document) {
        throw new AppError('Document not found.', 404);
    }

    const reference = await referenceModel.create({
        document_id,
        reference_code,
        title,
        description,
        source_type,
        target_url,
        metadata,
        created_by: userId,
    });

    return sendSuccess(res, 'Reference created successfully', reference, 201);
});

const getReferenceById = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const reference = await referenceModel.findById(id);

    if (!reference) {
        throw new AppError('Reference not found.', 404);
    }

    return sendSuccess(res, 'Reference retrieved successfully', reference);
});

const getReferencesByDocument = asyncHandler(async (req, res) => {
    const { documentId } = req.params;

    const document = await documentModel.findById(documentId);
    if (!document) {
        throw new AppError('Document not found.', 404);
    }

    const references = await referenceModel.findByDocumentId(documentId);
    return sendSuccess(res, 'Document references retrieved successfully', references);
});

const generateReferenceCode = asyncHandler(async (req, res) => {
    const { documentId } = req.params;
    const { prefix = 'REF' } = req.query;

    const document = await documentModel.findById(documentId);
    if (!document) {
        throw new AppError('Document not found.', 404);
    }

    const nextCode = await referenceModel.generateNextReferenceCode(documentId, prefix);
    return sendSuccess(res, 'Next reference code generated successfully', {
        document_id: documentId,
        reference_code: nextCode,
    });
});

const updateReference = asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    const { id } = req.params;

    const existing = await referenceModel.findById(id);
    if (!existing) {
        throw new AppError('Reference not found.', 404);
    }

    const updated = await referenceModel.update(id, req.body, userId);
    return sendSuccess(res, 'Reference updated successfully', updated);
});

const deleteReference = asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    const { id } = req.params;

    const existing = await referenceModel.findById(id);
    if (!existing) {
        throw new AppError('Reference not found.', 404);
    }

    const deleted = await referenceModel.softDelete(id, userId);
    return sendSuccess(res, 'Reference deleted successfully', deleted);
});

module.exports = {
    createReference,
    getReferenceById,
    getReferencesByDocument,
    generateReferenceCode,
    updateReference,
    deleteReference,
};
