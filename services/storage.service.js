const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
 
const generateStorageKey = (documentId, originalName) => {
    const timestamp = Date.now();
    const randomHex = crypto.randomBytes(6).toString('hex');
    const sanitized = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `documents/${documentId}/assets/${timestamp}_${randomHex}_${sanitized}`;
};

/**
 * Calculate SHA-256 hash of a file buffer
 * @param {Buffer} buffer
 * @returns {string} 64-char lowercase hex
 */
const calculateFileHash = (buffer) => {
    return crypto.createHash('sha256').update(buffer).digest('hex');
};

/**
 * Upload a binary buffer to storage provider
 * @param {Buffer} buffer
 * @param {string} storageKey
 * @param {string} mimeType
 * @returns {Promise<{ storageKey: string, size: number, mimeType: string }>}
 */
const uploadFile = async (buffer, storageKey, mimeType) => {
    const targetPath = path.join(UPLOADS_DIR, storageKey);
    const targetDir = path.dirname(targetPath);

    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
    }

    await fs.promises.writeFile(targetPath, buffer);

    return {
        storageKey,
        size: buffer.length,
        mimeType,
    };
};

/**
 * Read a file buffer from storage provider
 * @param {string} storageKey
 * @returns {Promise<Buffer>}
 */
const getFileBuffer = async (storageKey) => {
    const targetPath = path.join(UPLOADS_DIR, storageKey);
    if (!fs.existsSync(targetPath)) {
        throw new Error(`File not found at storage path: ${targetPath}`);
    }
    return fs.promises.readFile(targetPath);
};

/**
 * Delete a file from storage provider
 * @param {string} storageKey
 */
const deleteFile = async (storageKey) => {
    const targetPath = path.join(UPLOADS_DIR, storageKey);
    if (fs.existsSync(targetPath)) {
        await fs.promises.unlink(targetPath);
    }
};

/**
 * Get access URL or streaming path for a stored asset
 * @param {string} storageKey
 * @returns {string}
 */
const getFileUrl = (storageKey) => {
    if (process.env.STORAGE_PUBLIC_URL) {
        return `${process.env.STORAGE_PUBLIC_URL}/${storageKey}`;
    }
    return `/api/document-management/assets/file?key=${encodeURIComponent(storageKey)}`;
};

module.exports = {
    generateStorageKey,
    calculateFileHash,
    uploadFile,
    getFileBuffer,
    deleteFile,
    getFileUrl,
};
