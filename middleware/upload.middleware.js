const multer = require('multer');
const AppError = require('../utils/appError');

const storage = multer.memoryStorage();

const ALLOWED_IMAGE_TYPES = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/svg+xml',
];

const ALLOWED_ATTACHMENT_TYPES = [
    ...ALLOWED_IMAGE_TYPES,
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'text/csv',
];

const imageFileFilter = (req, file, cb) => {
    if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(
            new AppError(
                `Unsupported image type: ${file.mimetype}. Allowed types are: ${ALLOWED_IMAGE_TYPES.join(', ')}`,
                400
            ),
            false
        );
    }
};

const attachmentFileFilter = (req, file, cb) => {
    if (ALLOWED_ATTACHMENT_TYPES.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(
            new AppError(
                `Unsupported attachment type: ${file.mimetype}.`,
                400
            ),
            false
        );
    }
};

const imageMulter = multer({
    storage,
    limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
    fileFilter: imageFileFilter,
}).fields([
    { name: 'file', maxCount: 1 },
    { name: 'image', maxCount: 1 },
]);

const uploadImageMiddleware = (req, res, next) => {
    imageMulter(req, res, (err) => {
        if (err) return next(err);
        if (req.files) {
            req.file = req.files['file']?.[0] || req.files['image']?.[0];
        }
        next();
    });
};

const attachmentMulter = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
    fileFilter: attachmentFileFilter,
}).fields([
    { name: 'file', maxCount: 1 },
    { name: 'attachment', maxCount: 1 },
]);

const uploadAttachmentMiddleware = (req, res, next) => {
    attachmentMulter(req, res, (err) => {
        if (err) return next(err);
        if (req.files) {
            req.file = req.files['file']?.[0] || req.files['attachment']?.[0];
        }
        next();
    });
};

module.exports = {
    uploadImageMiddleware,
    uploadAttachmentMiddleware,
};
