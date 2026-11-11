const { z } = require('zod');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const uuidParamSchema = z.object({
    id: z.string().regex(UUID_REGEX, 'Invalid UUID format'),
});

const documentIdParamSchema = z.object({
    documentId: z.string().regex(UUID_REGEX, 'Invalid Document UUID format'),
});

const sectionIdParamSchema = z.object({
    sectionId: z.string().regex(UUID_REGEX, 'Invalid Section UUID format'),
});

const referenceCodeParamSchema = z.object({
    code: z
        .string()
        .trim()
        .min(1, 'Reference code cannot be empty')
        .max(50, 'Reference code cannot exceed 50 characters'),
});

const imageAnchorSchema = z.object({
    x: z.number().min(0).max(100, 'x coordinate must be between 0 and 100 percent'),
    y: z.number().min(0).max(100, 'y coordinate must be between 0 and 100 percent'),
    width: z.number().min(0).max(100).optional(),
    height: z.number().min(0).max(100).optional(),
    shape: z.enum(['PIN', 'RECTANGLE', 'ARROW', 'HIGHLIGHT']).default('PIN'),
});

const textAnchorSchema = z.object({
    blockId: z.string().optional().nullable(),
    startOffset: z.number().int().min(0).optional(),
    endOffset: z.number().int().min(0).optional(),
    selectedText: z.string().max(1000).optional(),
    contextPrefix: z.string().max(100).optional(),
    contextSuffix: z.string().max(100).optional(),
});

const createAnnotationSchema = z
    .object({
        document_id: z.string().regex(UUID_REGEX, 'document_id must be a valid UUID'),
        section_id: z.string().regex(UUID_REGEX, 'section_id must be a valid UUID').optional().nullable(),
        asset_id: z.string().regex(UUID_REGEX, 'asset_id must be a valid UUID').optional().nullable(),
        annotation_type: z.enum(['TEXT', 'IMAGE'], {
            required_error: 'annotation_type is required and must be TEXT or IMAGE',
        }),
        category: z.enum(['NOTES', 'ACTION', 'CDE', 'REGULATORY', 'REVISION']).default('NOTES'),
        anchor_data: z.record(z.any(), {
            required_error: 'anchor_data is required',
        }),
        annotation_text: z
            .string({ required_error: 'annotation_text is required' })
            .trim()
            .min(1, 'Annotation text cannot be empty')
            .max(5000, 'Annotation text cannot exceed 5000 characters'),
        reference_code: z.string().trim().max(50).optional().nullable(),
        reference_id: z.string().regex(UUID_REGEX).optional().nullable(),
    })
    .superRefine((data, ctx) => {
        if (data.annotation_type === 'IMAGE') {
            if (!data.asset_id) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: 'asset_id is required for IMAGE annotations',
                    path: ['asset_id'],
                });
            }
            const imgParsed = imageAnchorSchema.safeParse(data.anchor_data);
            if (!imgParsed.success) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: `Invalid IMAGE anchorData: ${imgParsed.error.issues.map((i) => i.message).join(', ')}`,
                    path: ['anchor_data'],
                });
            }
        } else if (data.annotation_type === 'TEXT') {
            const txtParsed = textAnchorSchema.safeParse(data.anchor_data);
            if (!txtParsed.success) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: `Invalid TEXT anchorData: ${txtParsed.error.issues.map((i) => i.message).join(', ')}`,
                    path: ['anchor_data'],
                });
            }
        }
    });

const updateAnnotationSchema = z.object({
    annotation_text: z.string().trim().min(1).max(5000).optional(),
    category: z.enum(['NOTES', 'ACTION', 'CDE', 'REGULATORY', 'REVISION']).optional(),
    status: z.enum(['open', 'resolved', 'deleted']).optional(),
    anchor_data: z.record(z.any()).optional(),
});

const annotationQuerySchema = z.object({
    annotation_type: z.enum(['TEXT', 'IMAGE']).optional(),
    category: z.enum(['NOTES', 'ACTION', 'CDE', 'REGULATORY', 'REVISION']).optional(),
    status: z.enum(['open', 'resolved', 'deleted', 'all']).default('open'),
    reference_code: z.string().trim().optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(50),
});

module.exports = {
    uuidParamSchema,
    documentIdParamSchema,
    sectionIdParamSchema,
    referenceCodeParamSchema,
    createAnnotationSchema,
    updateAnnotationSchema,
    annotationQuerySchema,
};
