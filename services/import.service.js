const { withTransaction } = require('../config/db');
const AppError = require('../utils/appError');
const importModel = require('../models/import.model');
const sectionModel = require('../models/section.model');
const documentModel = require('../models/document.model');
const { getFileBuffer } = require('./storage.service');
const { parsePdfToDocumentStructure } = require('./pdfParser.service');

/**
 * Asynchronous Background Ingestion Task
 * Real PDF Parsing pipeline:
 * 1. Reads the uploaded binary file from storage
 * 2. Parses pages, extracts text, detects headings and hierarchies
 * 3. Assembles TipTap/ProseMirror JSON blocks
 * 4. Preserves page boundaries (page_start, page_end)
 * 5. Saves extracted structure for human review and confirmation
 * @param {string} jobId
 */
const processImportJobAsync = async (jobId) => {
    try {
        const job = await importModel.findById(jobId);
        if (!job || job.status === 'cancelled') return;

        // Stage 1: Reading file from storage
        await importModel.updateProgress(jobId, {
            status: 'processing',
            processing_stage: 'reading_file',
            progress_percent: 15,
            started_at: new Date(),
        });

        const fileBuffer = await getFileBuffer(job.source_storage_key);

        // Stage 2: Parsing PDF or Document structure
        await importModel.updateProgress(jobId, {
            processing_stage: 'extracting_text_and_pages',
            progress_percent: 45,
        });

        let extractedStructure;

        if (
            job.source_mime_type === 'application/pdf' ||
            job.source_file_name.toLowerCase().endsWith('.pdf')
        ) {
            extractedStructure = await parsePdfToDocumentStructure(
                fileBuffer,
                job.source_file_name
            );
        } else {
            const text = fileBuffer.toString('utf-8');
            const lines = text.split('\n').filter((l) => l.trim().length > 0);
            extractedStructure = {
                source_file: job.source_file_name,
                total_pages_detected: 1,
                sections: [
                    {
                        title: `${job.source_file_name} - Extracted Content`,
                        section_number: '1.0',
                        order: 0,
                        page_start: 1,
                        page_end: 1,
                        content: {
                            type: 'doc',
                            content: lines.map((l) => ({
                                type: 'paragraph',
                                content: [{ type: 'text', text: l.trim() }],
                            })),
                        },
                        subsections: [],
                    },
                ],
            };
        }

        // Stage 3: Structuring TipTap blocks
        await importModel.updateProgress(jobId, {
            processing_stage: 'structuring_sections_and_tiptap',
            progress_percent: 85,
        });

        // Stage 4: Mark Complete & Ready for Human Review
        await importModel.updateProgress(jobId, {
            status: 'completed',
            processing_stage: 'ready_for_review',
            progress_percent: 100,
            extracted_structure: extractedStructure,
            completed_at: new Date(),
        });
    } catch (err) {
        console.error('Import background job error:', err);
        await importModel.updateProgress(jobId, {
            status: 'failed',
            processing_stage: 'failed',
            error_message: err.message || 'An error occurred during file extraction.',
            completed_at: new Date(),
        });
    }
};

/**
 * Confirm and materialize human-reviewed extracted structure into real document sections
 * @param {object} params
 */
const confirmImportedStructure = async ({
    jobId,
    documentId,
    confirmedSections,
    userId,
}) => {
    const job = await importModel.findById(jobId);
    if (!job) {
        throw new AppError('Import job not found.', 404);
    }

    if (job.status !== 'completed') {
        throw new AppError(
            `Cannot confirm import: Job status is '${job.status}'. Expected 'completed'.`,
            400
        );
    }

    const document = await documentModel.findById(documentId);
    if (!document) {
        throw new AppError('Document not found.', 404);
    }

    return withTransaction(async (client) => {
        const sectionsToCreate = confirmedSections || job.extracted_structure?.sections || [];
        const createdSections = [];

        const recursivelyInsert = async (sections, parentSectionId = null) => {
            for (let i = 0; i < sections.length; i++) {
                const item = sections[i];
                const section = await sectionModel.create(
                    {
                        document_id: documentId,
                        parent_section_id: parentSectionId,
                        section_title: item.title,
                        section_number: item.section_number || null,
                        section_order: item.order ?? i,
                        content: item.content || { type: 'doc', content: [] },
                        page_start: item.page_start || null,
                        page_end: item.page_end || null,
                        created_by: userId,
                        updated_by: userId,
                    },
                    client
                );
                createdSections.push(section);

                if (Array.isArray(item.subsections) && item.subsections.length > 0) {
                    await recursivelyInsert(item.subsections, section.id);
                }
            }
        };

        await recursivelyInsert(sectionsToCreate);

        await client.query(
            `UPDATE document_management.document_import_jobs SET document_id = $1 WHERE id = $2;`,
            [documentId, jobId]
        );

        return {
            document_id: documentId,
            job_id: jobId,
            sections_created_count: createdSections.length,
            sections: createdSections,
        };
    });
};

module.exports = {
    processImportJobAsync,
    confirmImportedStructure,
};
