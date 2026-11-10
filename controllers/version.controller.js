const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/appError');
const { sendSuccess } = require('../utils/response');
const versionModel = require('../models/version.model');
const versionService = require('../services/version.service');

const commitDocumentChanges = asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    const documentId = req.params.documentId || req.body.document_id;
    const commitMessage = req.body.commit_message || req.body.commitMessage;
    const versionTag = req.body.version_tag || req.body.versionTag;

    if (!documentId) {
        throw new AppError('document_id is required to commit changes.', 400);
    }

    const version = await versionService.commitDocument({
        documentId,
        commitMessage,
        versionTag,
        userId,
    });

    return sendSuccess(res, 'Document version committed successfully', version, 201);
});

const getDocumentVersionHistory = asyncHandler(async (req, res) => {
    const { documentId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const { versions, total } = await versionModel.findByDocumentId(documentId, {
        limit: Number(limit),
        offset,
    });

    const totalPages = Math.ceil(total / limit) || 1;

    return sendSuccess(res, 'Version history retrieved successfully', versions, 200, {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages,
    });
});

const getVersionById = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const version = await versionModel.findById(id);

    if (!version) {
        throw new AppError('Document version not found.', 404);
    }

    return sendSuccess(res, 'Version details retrieved successfully', version);
});

const getVersionManifest = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const manifest = await versionModel.getVersionManifest(id);
    return sendSuccess(res, 'Version manifest retrieved successfully', manifest);
});

const getVersionChanges = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const changes = await versionModel.getVersionChanges(id);
    return sendSuccess(res, 'Version changes retrieved successfully', changes);
});

const compareTwoVersions = asyncHandler(async (req, res) => {
    const { v1, v2 } = req.query;

    const diff = await versionService.compareVersions({
        versionId1: v1,
        versionId2: v2,
    });

    return sendSuccess(res, 'Version comparison completed successfully', diff);
});

const restoreOlderVersion = asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    const { documentId, versionId } = req.params;
    const targetVersionId = versionId || req.body.version_id || req.body.versionId || req.body.targetVersionId;
    const commitMessage = req.body.commit_message || req.body.commitMessage;

    if (!targetVersionId) {
        throw new AppError('version_id is required to restore version.', 400);
    }

    const restoredVersion = await versionService.restoreVersion({
        targetVersionId,
        documentId,
        commitMessage,
        userId,
    });

    return sendSuccess(
        res,
        `Document restored successfully to state of Version v${restoredVersion.version_number}. New commit created.`,
        restoredVersion,
        201
    );
});

module.exports = {
    commitDocumentChanges,
    getDocumentVersionHistory,
    getVersionById,
    getVersionManifest,
    getVersionChanges,
    compareTwoVersions,
    restoreOlderVersion,
};
