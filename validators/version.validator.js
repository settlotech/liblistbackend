const { z } = require('zod');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const uuidParamSchema = z.object({
    id: z.string().regex(UUID_REGEX, 'Invalid UUID format'),
}).passthrough();

const documentIdParamSchema = z.object({
    documentId: z.string().regex(UUID_REGEX, 'Invalid Document UUID format'),
}).passthrough();

const restoreParamsSchema = z.object({
    documentId: z.string().regex(UUID_REGEX, 'Invalid Document UUID format'),
    versionId: z.string().regex(UUID_REGEX, 'Invalid Version UUID format').optional(),
}).passthrough();

const commitDocumentSchema = z.object({
    document_id: z
        .string()
        .regex(UUID_REGEX, 'document_id must be a valid UUID')
        .optional()
        .nullable(),
    commit_message: z
        .string({ required_error: 'commit_message is required' })
        .trim()
        .min(1, 'Commit message cannot be empty')
        .max(1000, 'Commit message cannot exceed 1000 characters'),
    version_tag: z.string().trim().max(100).optional().nullable(),
});

const compareVersionsQuerySchema = z.object({
    v1: z
        .string({ required_error: 'v1 (first version ID) is required' })
        .regex(UUID_REGEX, 'v1 must be a valid UUID'),
    v2: z
        .string({ required_error: 'v2 (second version ID) is required' })
        .regex(UUID_REGEX, 'v2 must be a valid UUID'),
});

const restoreVersionSchema = z.object({
    version_id: z.string().regex(UUID_REGEX, 'Invalid version UUID').optional().nullable(),
    versionId: z.string().regex(UUID_REGEX, 'Invalid version UUID').optional().nullable(),
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
