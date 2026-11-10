const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/appError');
const { sendSuccess } = require('../utils/response');
const assetModel = require('../models/asset.model');
const documentModel = require('../models/document.model');
const activityModel = require('../models/activity.model');
const {
    generateStorageKey,
    calculateFileHash,
    uploadFile,
    deleteFile,
    getFileUrl,
} = require('../services/storage.service');

const uploadImageAsset = asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    const document_id = req.params.documentId || req.body.document_id || req.body.documentId;
    const { caption, alt_text } = req.body;

    if (!req.file) {
        throw new AppError('No image file provided in upload request.', 400);
    }

    if (!document_id) {
        throw new AppError('document_id is required for uploading image asset.', 400);
    }

    const document = await documentModel.findById(document_id);
    if (!document) {
        throw new AppError('Document not found.', 404);
    }

    const storageKey = generateStorageKey(document_id, req.file.originalname);
    const fileHash = calculateFileHash(req.file.buffer);

    await uploadFile(req.file.buffer, storageKey, req.file.mimetype);

    const section_id = req.body.section_id || req.body.sectionId || null;
    const asset = await assetModel.create({
        document_id,
        section_id,
        file_name: req.file.originalname,
        mime_type: req.file.mimetype,
        file_size: req.file.size,
        storage_key: storageKey,
        file_hash: fileHash,
        uploaded_by: userId,
    });

    await activityModel.logActivity({
        document_id,
        library_id: document.library_id,
        activity_type: 'IMAGE_UPLOADED',
        entity_type: 'asset',
        entity_id: asset.id,
        description: `Image '${asset.file_name}' uploaded.`,
        metadata: { storage_key: storageKey, size: asset.file_size },
        actor_id: userId,
    });

    return sendSuccess(
        res,
        'Image asset uploaded successfully',
        {
            ...asset,
            url: getFileUrl(asset.storage_key),
        },
        201
    );
});

const uploadDocumentAttachment = asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    const document_id = req.params.documentId || req.body.document_id || req.body.documentId;
    const { description } = req.body;

    if (!req.file) {
        throw new AppError('No attachment file provided in upload request.', 400);
    }

    if (!document_id) {
        throw new AppError('document_id is required for uploading attachment.', 400);
    }

    const document = await documentModel.findById(document_id);
    if (!document) {
        throw new AppError('Document not found.', 404);
    }

    const storageKey = generateStorageKey(document_id, req.file.originalname);
    const fileHash = calculateFileHash(req.file.buffer);

    await uploadFile(req.file.buffer, storageKey, req.file.mimetype);

    const asset = await assetModel.create({
        document_id,
        file_name: req.file.originalname,
        mime_type: req.file.mimetype,
        file_size: req.file.size,
        storage_key: storageKey,
        file_hash: fileHash,
        uploaded_by: userId,
    });

    await activityModel.logActivity({
        document_id,
        library_id: document.library_id,
        activity_type: 'ATTACHMENT_UPLOADED',
        entity_type: 'asset',
        entity_id: asset.id,
        description: `Attachment '${asset.file_name}' uploaded.`,
        metadata: { storage_key: storageKey, size: asset.file_size },
        actor_id: userId,
    });

    return sendSuccess(
        res,
        'Attachment uploaded successfully',
        {
            ...asset,
            url: getFileUrl(asset.storage_key),
        },
        201
    );
});

const getAssetDetails = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const asset = await assetModel.findById(id);

    if (!asset) {
        throw new AppError('Asset not found.', 404);
    }

    return sendSuccess(res, 'Asset details retrieved successfully', {
        ...asset,
        url: getFileUrl(asset.storage_key),
    });
});

const getAssetsByDocument = asyncHandler(async (req, res) => {
    const { documentId } = req.params;
    const { file_type } = req.query;

    const document = await documentModel.findById(documentId);
    if (!document) {
        throw new AppError('Document not found.', 404);
    }

    const assets = await assetModel.findByDocumentId(documentId, { file_type });
    const formatted = assets.map((a) => ({
        ...a,
        url: getFileUrl(a.storage_key),
    }));

    return sendSuccess(res, 'Document assets retrieved successfully', formatted);
});

const deleteAsset = asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    const { id } = req.params;

    const asset = await assetModel.findById(id);
    if (!asset) {
        throw new AppError('Asset not found.', 404);
    }

    await deleteFile(asset.storage_key).catch(() => {});
    const deleted = await assetModel.softDelete(id, userId);

    return sendSuccess(res, 'Asset deleted successfully', deleted);
});

const updateAssetMetadata = asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    const { id } = req.params;
    const { metadata } = req.body;

    const asset = await assetModel.findById(id);
    if (!asset) {
        throw new AppError('Asset not found.', 404);
    }

    const updated = await assetModel.updateMetadata(id, metadata, userId);
    return sendSuccess(res, 'Asset metadata updated successfully', updated);
});

module.exports = {
    uploadImageAsset,
    uploadDocumentAttachment,
    getAssetDetails,
    getAssetsByDocument,
    deleteAsset,
    updateAssetMetadata,
};
