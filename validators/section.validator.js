const { z } = require('zod');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const uuidParamSchema = z.object({
    id: z.string().regex(UUID_REGEX, 'Invalid UUID format'),
});

const documentIdParamSchema = z.object({
    documentId: z.string().regex(UUID_REGEX, 'Invalid Document UUID format'),
});

const richTextContentSchema = z
    .union([z.record(z.any()), z.string(), z.array(z.any())])
    .default({ type: 'doc', content: [] });

const createSectionSchema = z.object({
    document_id: z
        .string({ required_error: 'document_id is required' })
        .regex(UUID_REGEX, 'document_id must be a valid UUID'),
    parent_section_id: z
        .string()
        .regex(UUID_REGEX, 'parent_section_id must be a valid UUID')
        .optional()
        .nullable(),
    section_title: z
        .string({ required_error: 'section_title is required' })
        .trim()
        .min(1, 'Section title cannot be empty')
        .max(500, 'Section title cannot exceed 500 characters'),
    section_number: z.string().trim().max(100).optional().nullable(),
    section_order: z.number().int().min(0).default(0),
    content: richTextContentSchema.optional(),
    page_start: z.number().int().positive().optional().nullable(),
    page_end: z.number().int().positive().optional().nullable(),
}).refine(
    (data) => {
        if (data.page_start && data.page_end) {
            return data.page_end >= data.page_start;
        }
        return true;
    },
    {
        message: 'page_end must be greater than or equal to page_start',
        path: ['page_end'],
    }
);

const createSubSectionSchema = z.object({
    parent_section_id: z
        .string({ required_error: 'parent_section_id is required' })
        .regex(UUID_REGEX, 'parent_section_id must be a valid UUID'),
    section_title: z
        .string({ required_error: 'section_title is required' })
        .trim()
        .min(1, 'Section title cannot be empty')
        .max(500, 'Section title cannot exceed 500 characters'),
    section_number: z.string().trim().max(100).optional().nullable(),
    section_order: z.number().int().min(0).default(0),
    content: richTextContentSchema.optional(),
    page_start: z.number().int().positive().optional().nullable(),
    page_end: z.number().int().positive().optional().nullable(),
});

const updateSectionMetadataSchema = z.object({
    section_title: z
        .string()
        .trim()
        .min(1, 'Section title cannot be empty')
        .max(500, 'Section title cannot exceed 500 characters')
        .optional(),
    section_number: z.string().trim().max(100).optional().nullable(),
    section_order: z.number().int().min(0).optional(),
    page_start: z.number().int().positive().optional().nullable(),
    page_end: z.number().int().positive().optional().nullable(),
    content: z.any().optional(),
    lock_version: z
        .number()
        .int()
        .min(1)
        .optional(),
}).refine(
    (data) => {
        if (data.page_start && data.page_end) {
            return data.page_end >= data.page_start;
        }
        return true;
    },
    {
        message: 'page_end must be greater than or equal to page_start',
        path: ['page_end'],
    }
);

const updateSectionContentSchema = z.object({
    content: z.any({ required_error: 'content is required' }),
    lock_version: z
        .number()
        .int()
        .min(1)
        .optional(),
});

const moveSectionSchema = z.object({
    target_parent_section_id: z
        .string()
        .regex(UUID_REGEX, 'target_parent_section_id must be a valid UUID')
        .nullable(),
    section_order: z.number().int().min(0).optional(),
    lock_version: z
        .number({ required_error: 'lock_version is required for optimistic concurrency control' })
        .int()
        .min(1),
});

const reorderSectionsSchema = z.object({
    document_id: z
        .string({ required_error: 'document_id is required' })
        .regex(UUID_REGEX, 'document_id must be a valid UUID'),
    items: z
        .array(
            z.object({
                id: z.string().regex(UUID_REGEX, 'Invalid section UUID'),
                section_order: z.number().int().min(0),
                parent_section_id: z
                    .string()
                    .regex(UUID_REGEX)
                    .optional()
                    .nullable(),
            })
        )
        .min(1, 'Reorder list cannot be empty'),
});

const sectionQuerySchema = z.object({
    include_content: z
        .string()
        .optional()
        .transform((val) => val === 'true'),
    parent_section_id: z
        .union([z.string().regex(UUID_REGEX), z.literal('null'), z.literal('')])
        .optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(50),
});

module.exports = {
    uuidParamSchema,
    documentIdParamSchema,
    createSectionSchema,
    createSubSectionSchema,
    updateSectionMetadataSchema,
    updateSectionContentSchema,
    moveSectionSchema,
    reorderSectionsSchema,
    sectionQuerySchema,
};
