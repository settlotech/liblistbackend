const AppError = require('../utils/appError');

/**
 * Enhanced Reusable Validation Middleware
 * Validates req.body, req.query, or req.params using a Zod schema.
 * Fully backwards-compatible with existing routes calling validate(schema)
 * and new document management routes calling validate(schema, 'query' | 'params').
 *
 * @param {import('zod').ZodSchema} schema - Zod validation schema
 * @param {'body' | 'query' | 'params'} [source='body'] - Request property to validate
 * @returns {import('express').RequestHandler}
 */
const validate = (schema, source = 'body') => {
    return async (req, res, next) => {
        try {
            if (!schema) {
                return next();
            }

            const target = req[source];
            let result;

            if (typeof schema.safeParseAsync === 'function') {
                result = await schema.safeParseAsync(target);
            } else if (typeof schema.safeParse === 'function') {
                result = schema.safeParse(target);
            } else {
                return next();
            }

            if (!result.success) {
                const issues = result.error.errors || result.error.issues || [];
                const formattedErrors = issues.map((issue) => ({
                    field: issue.path.join('.'),
                    message: issue.message,
                }));

                return res.status(400).json({
                    success: false,
                    message: 'Validation failed',
                    errors: formattedErrors,
                    data: { details: formattedErrors },
                });
            }

            // In Express 5, req.query is a getter. Handle safely:
            if (source === 'query' && req.query && typeof req.query === 'object') {
                Object.keys(req.query).forEach((key) => delete req.query[key]);
                Object.assign(req.query, result.data);
            } else {
                try {
                    req[source] = result.data;
                } catch {
                    if (req[source] && typeof req[source] === 'object') {
                        Object.assign(req[source], result.data);
                    }
                }
            }

            next();
        } catch (error) {
            next(error);
        }
    };
};

module.exports = validate;
