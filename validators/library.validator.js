const { z } = require('zod');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const uuidParamSchema = z.object({
    id: z.string().regex(UUID_REGEX, 'Invalid UUID format'),
});

const createLibrarySchema = z.object({
    parent_library_id: z
        .string()
        .regex(UUID_REGEX, 'parent_library_id must be a valid UUID')
        .optional()
        .nullable(),
    library_name: z
        .string({ required_error: 'library_name is required' })
        .trim()
        .min(1, 'Library name cannot be empty')
        .max(255, 'Library name cannot exceed 255 characters'),
    description: z.string().trim().max(2000).optional().nullable(),
    display_order: z.number().int().min(0).default(0),
});

const updateLibrarySchema = z.object({
    library_name: z
        .string()
        .trim()
        .min(1, 'Library name cannot be empty')
        .max(255, 'Library name cannot exceed 255 characters')
        .optional(),
    description: z.string().trim().max(2000).optional().nullable(),
    display_order: z.number().int().min(0).optional(),
    status: z.enum(['active', 'archived']).optional(),
});

const moveLibrarySchema = z.object({
    target_parent_library_id: z
        .string()
        .regex(UUID_REGEX, 'target_parent_library_id must be a valid UUID')
        .nullable(),
});

const libraryQuerySchema = z.object({
    parent_library_id: z
        .union([z.string().regex(UUID_REGEX), z.literal('null'), z.literal('')])
        .optional(),
    status: z.enum(['active', 'archived']).optional().default('active'),
    search: z.string().trim().optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
});

module.exports = {
    uuidParamSchema,
    createLibrarySchema,
    updateLibrarySchema,
    moveLibrarySchema,
    libraryQuerySchema,
};
