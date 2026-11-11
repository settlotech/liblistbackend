const { z } = require('zod');

// Accepts valid UUID or standard string identifier (e.g. slug or system ID)
const idString = z.string().min(1, 'Identifier cannot be empty');

const uuidParamSchema = z.object({
    id: idString,
}).passthrough();

const documentIdParamSchema = z.object({
    documentId: idString,
}).passthrough();

const restoreParamsSchema = z.object({
    documentId: idString,
    versionId: idString.optional(),
}).passthrough();

const commitDocumentSchema = z.object({
    document_id: idString.optional().nullable(),
    commit_message: z
        .string({ required_error: 'commit_message is required' })
        .trim()
        .min(1, 'Commit message cannot be empty')
        .max(1000, 'Commit message cannot exceed 1000 characters'),
    version_tag: z.string().trim().max(100).optional().nullable(),
});

const compareVersionsQuerySchema = z.object({
    v1: idString,
    v2: idString,
});

const restoreVersionSchema = z.object({
    version_id: idString.optional().nullable(),
    versionId: idString.optional().nullable(),
    commit_message: z.string().trim().max(1000).optional().nullable(),
}).passthrough();

module.exports = {
    uuidParamSchema,
    documentIdParamSchema,
    restoreParamsSchema,
    commitDocumentSchema,
    compareVersionsQuerySchema,
    restoreVersionSchema,
};
