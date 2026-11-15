const { z } = require('zod');

const passwordSchema = z.string().min(6, 'Password must contain at least 6 characters').max(72, 'Password must not exceed 72 characters')
    .refine(value => Buffer.byteLength(value, 'utf8') <= 72,'Password must not exceed 72 UTF-8 bytes');

const registerSchema = z.object({
    name: z.string().trim().min(2).max(100),
    email: z.string().trim().email().max(255).transform(value => value.toLowerCase()),
    password: passwordSchema 
}).strict();

const loginSchema = z.object({
    email: z.string().trim().email().max(255).transform(value => value.toLowerCase()),
    password: z.string().min(1).max(72).refine(value => Buffer.byteLength(value, 'utf8') <= 72),
    rememberMe : z.boolean()
}).strict();

const profileSchema = z.object({
    name: z.string().trim().min(2).max(100)
}).strict();

const changePasswordSchema = z.object({
    currentPassword: z.string().min(1).max(72),
    newPassword: passwordSchema
}).strict();

module.exports = {
    registerSchema,
    loginSchema,
    profileSchema,
    changePasswordSchema
};