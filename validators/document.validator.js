const { z } = require('zod');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const uuidParamSchema = z.object({
    id: z.string().regex(UUID_REGEX, 'Invalid UUID format'),
});

const libraryIdParamSchema = z.object({
    libraryId: z.string().regex(UUID_REGEX, 'Invalid Library UUID format'),
});

const createDocumentSchema = z.object({
    library_id: z
        .string({ required_error: 'library_id is required' })
        .regex(UUID_REGEX, 'library_id must be a valid UUID'),
    document_name: z
        .string({ required_error: 'document_name is required' })
        .trim()
        .min(1, 'Document name cannot be empty')
        .max(500, 'Document name cannot exceed 500 characters'),
    description: z.string().trim().max(4000).optional().nullable(),
    document_type: z.string().trim().max(100).optional().nullable(),
    source_type: z
        .enum(['manual', 'template', 'import_pdf', 'import_docx'])
        .default('manual'),
});

const updateDocumentSchema = z.object({
    document_name: z
        .string()
        .trim()
        .min(1, 'Document name cannot be empty')
        .max(500, 'Document name cannot exceed 500 characters')
        .optional(),
    description: z.string().trim().max(4000).optional().nullable(),
    document_type: z.string().trim().max(100).optional().nullable(),
    status: z.enum(['draft', 'in_review', 'approved', 'archived']).optional(),
});

const moveDocumentSchema = z.object({
    target_library_id: z
        .string({ required_error: 'target_library_id is required' })
        .regex(UUID_REGEX, 'target_library_id must be a valid UUID'),
});

const documentQuerySchema = z.object({
    library_id: z.string().regex(UUID_REGEX).optional(),
    status: z
        .enum(['draft', 'in_review', 'approved', 'archived', 'all'])
        .optional()
        .default('all'),
    document_type: z.string().trim().optional(),
    search: z.string().trim().optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
});

const documentSearchSchema = z.object({
    q: z
        .string({ required_error: 'Search query (q) is required' })
        .trim()
        .min(1, 'Search query cannot be empty'),
    library_id: z.string().regex(UUID_REGEX).optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
});

module.exports = {
    uuidParamSchema,
    libraryIdParamSchema,
    createDocumentSchema,
    updateDocumentSchema,
    moveDocumentSchema,
    documentQuerySchema,
    documentSearchSchema,
};
