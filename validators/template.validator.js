const { z } = require('zod');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const uuidParamSchema = z.object({
    id: z.string().regex(UUID_REGEX, 'Invalid UUID format'),
});

const sectionTemplateItemSchema = z.lazy(() =>
    z.object({
        title: z.string().trim().min(1, 'Section template title is required'),
        section_number: z.string().trim().optional().nullable(),
        order: z.number().int().min(0).default(0),
        content: z.record(z.any()).default({ type: 'doc', content: [] }),
        subsections: z.array(sectionTemplateItemSchema).default([]),
    })
);

const createTemplateSchema = z.object({
    template_name: z
        .string({ required_error: 'template_name is required' })
        .trim()
        .min(1, 'Template name cannot be empty')
        .max(255, 'Template name cannot exceed 255 characters'),
    description: z.string().trim().max(2000).optional().nullable(),
    category: z.string().trim().max(100).optional().nullable(),
    structure: z.object({
        sections: z.array(sectionTemplateItemSchema).min(1, 'Template must define at least one section'),
    }),
});

const instantiateDocumentFromTemplateSchema = z.object({
    library_id: z
        .string({ required_error: 'library_id is required' })
        .regex(UUID_REGEX, 'library_id must be a valid UUID'),
    document_name: z
        .string({ required_error: 'document_name is required' })
        .trim()
        .min(1, 'Document name cannot be empty')
        .max(500, 'Document name cannot exceed 500 characters'),
    description: z.string().trim().max(4000).optional().nullable(),
});

module.exports = {
    uuidParamSchema,
    createTemplateSchema,
    instantiateDocumentFromTemplateSchema,
};
