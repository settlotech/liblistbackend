const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/appError');
const { sendSuccess } = require('../utils/response');
const importModel = require('../models/import.model');
const importService = require('../services/import.service');
const { generateStorageKey, uploadFile } = require('../services/storage.service');

const startImportJob = asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    const { document_id } = req.body;

    if (!req.file) {
        throw new AppError('No document file uploaded. Please provide a PDF or DOCX file.', 400);
    }

    const storageKey = generateStorageKey(document_id || 'unassigned', req.file.originalname);
    await uploadFile(req.file.buffer, storageKey, req.file.mimetype);

    const job = await importModel.createJob({
        document_id: document_id || null,
        source_file_name: req.file.originalname,
        source_storage_key: storageKey,
        source_mime_type: req.file.mimetype,
        source_file_size: req.file.size,
        requested_by: userId,
    });

    setImmediate(() => {
        importService.processImportJobAsync(job.id);
    });

    return sendSuccess(
        res,
        'Document import job queued successfully. Processing asynchronously.',
        {
            job_id: job.id,
            status: job.status,
            file_name: job.source_file_name,
            file_size: job.source_file_size,
        },
        202
    );
});

const getImportJobStatus = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const job = await importModel.findById(id);

    if (!job) {
        throw new AppError('Import job not found.', 404);
    }

    return sendSuccess(res, 'Import job status retrieved successfully', {
        job_id: job.id,
        status: job.status,
        processing_stage: job.processing_stage,
        progress_percent: job.progress_percent,
        error_message: job.error_message,
        started_at: job.started_at,
        completed_at: job.completed_at,
    });
});

const reviewExtractedContent = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const job = await importModel.findById(id);

    if (!job) {
        throw new AppError('Import job not found.', 404);
    }

    if (job.status !== 'completed') {
        throw new AppError(
            `Extracted content is not ready for review yet. Current status: '${job.status}'.`,
            400
        );
    }

    return sendSuccess(res, 'Extracted content structure retrieved successfully', {
        job_id: job.id,
        extracted_structure: job.extracted_structure,
    });
});

const confirmExtractedDocument = asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    const { id: jobId } = req.params;
    const { document_id, confirmed_sections } = req.body;

    const result = await importService.confirmImportedStructure({
        jobId,
        documentId: document_id,
        confirmedSections: confirmed_sections,
        userId,
    });

    return sendSuccess(
        res,
        'Imported document structure confirmed and materialized successfully',
        result,
        201
    );
});

const retryImportJob = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const job = await importModel.findById(id);

    if (!job) {
        throw new AppError('Import job not found.', 404);
    }

    await importModel.updateProgress(id, {
        status: 'queued',
        processing_stage: 'queued_for_retry',
        progress_percent: 0,
        error_message: null,
    });

    setImmediate(() => {
        importService.processImportJobAsync(id);
    });

    return sendSuccess(res, 'Import job queued for retry.', { job_id: id });
});

const cancelImportJob = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const job = await importModel.findById(id);

    if (!job) {
        throw new AppError('Import job not found.', 404);
    }

    if (job.status === 'completed') {
        throw new AppError('Cannot cancel an already completed import job.', 400);
    }

    await importModel.updateProgress(id, {
        status: 'cancelled',
        processing_stage: 'cancelled_by_user',
        completed_at: new Date(),
    });

    return sendSuccess(res, 'Import job cancelled successfully.', { job_id: id });
});

module.exports = {
    startImportJob,
    getImportJobStatus,
    reviewExtractedContent,
    confirmExtractedDocument,
    retryImportJob,
    cancelImportJob,
};
