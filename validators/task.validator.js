const { z } = require('zod');

// Flexible user identifier: supports both UUIDs and string keys (e.g. 'u_cba_david', 'usr-3')
const userIdSchema = z.string().trim().min(1, 'User identifier required').max(255);

const createTaskSchema = z.object({
    title: z.string().trim().min(1, 'Task title is required').max(255),
    description: z.string().trim().max(5000).optional().nullable(),
    category: z.enum(['common', 'general']).default('general'),
    library_id: z.string().max(100).optional().nullable(),
    section_id: z.string().max(100).optional().nullable(),
    linked_policy_id: z.string().max(100).optional().nullable(),
    policy_id: z.string().max(100).optional().nullable(),
    priority: z.string().max(50).optional().nullable(),
    assigned_to: userIdSchema.optional().nullable(),
    assigned_by: z.string().max(255).optional().nullable(),
    participants: z.array(
        z.object({
            user_id: userIdSchema,
            role: z.enum(['approver', 'reviewer', 'for_info'])
        })
    ).max(50).optional().default([])
}).passthrough();

const updateTaskSchema = z.object({
    title: z.string().trim().min(1).max(255).optional(),
    description: z.string().trim().max(5000).optional().nullable(),
    category: z.enum(['common', 'general']).optional(),
    library_id: z.string().max(100).optional().nullable(),
    section_id: z.string().max(100).optional().nullable(),
    linked_policy_id: z.string().max(100).optional().nullable()
}).passthrough();

const assignTaskSchema = z.object({
    assigned_to: userIdSchema.nullable()
}).passthrough();

const statusUpdateSchema = z.object({
    status: z.enum(['pending', 'in_progress', 'responded', 'completed', 'approved', 'cancelled']),
    comment: z.string().trim().max(1000).optional().nullable()
}).passthrough();

const addParticipantSchema = z.object({
    user_id: userIdSchema,
    role: z.enum(['approver', 'reviewer', 'for_info'])
}).passthrough();

const addCommentSchema = z.object({
    comment: z.string().trim().min(1, 'Comment cannot be empty').max(2000)
}).passthrough();

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
