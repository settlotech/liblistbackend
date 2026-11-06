const { z } = require('zod');

const uuidSchema = z.string().uuid('Must be a valid UUID');

const createTaskSchema = z.object({
    title: z.string().trim().min(1, 'Task title is required').max(255),
    description: z.string().trim().max(5000).optional().nullable(),
    category: z.enum(['common', 'general']).default('general'),
    library_id: z.string().max(100).optional().nullable(),
    section_id: z.string().max(100).optional().nullable(),
    assigned_to: uuidSchema.optional().nullable(),
    participants: z.array(
        z.object({
            user_id: uuidSchema,
            role: z.enum(['approver', 'reviewer', 'for_info'])
        })
    ).max(50).optional().default([])
}).strict();

const updateTaskSchema = z.object({
    title: z.string().trim().min(1).max(255).optional(),
    description: z.string().trim().max(5000).optional().nullable(),
    category: z.enum(['common', 'general']).optional()
}).strict();

const assignTaskSchema = z.object({
    assigned_to: uuidSchema.nullable()
}).strict();

const statusUpdateSchema = z.object({
    status: z.enum(['responded', 'completed', 'approved', 'cancelled']),
    comment: z.string().trim().max(1000).optional().nullable()
}).strict();

const addParticipantSchema = z.object({
    user_id: uuidSchema,
    role: z.enum(['approver', 'reviewer', 'for_info'])
}).strict();

const addCommentSchema = z.object({
    comment: z.string().trim().min(1, 'Comment cannot be empty').max(2000)
}).strict();


const validate = (schema) => (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
        const errors = result.error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message
        }));
        return res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors
        });
    }
    req.body = result.data;
    next();
};

module.exports = {
    validate,
    createTaskSchema,
    updateTaskSchema,
    assignTaskSchema,
    statusUpdateSchema,
    addParticipantSchema,
    addCommentSchema
};
