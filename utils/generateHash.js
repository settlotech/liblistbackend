const crypto = require('crypto');

/**
 * Deterministically serialize a JSON value into a canonical string.
 * Recursively sorts all object keys.
 * @param {any} val
 * @returns {string}
 */
const canonicalStringify = (val) => {
    if (val === null || val === undefined) {
        return 'null';
    }
    if (typeof val !== 'object') {
        return JSON.stringify(val);
    }
    if (Array.isArray(val)) {
        return '[' + val.map(canonicalStringify).join(',') + ']';
    }
    const sortedKeys = Object.keys(val).sort();
    const entries = sortedKeys.map((k) => JSON.stringify(k) + ':' + canonicalStringify(val[k]));
    return '{' + entries.join(',') + '}';
};

/**
 * Compute SHA-256 hash of a TipTap / ProseMirror rich-text document
 * @param {object} content - ProseMirror JSON content object
 * @returns {string} 64-character lowercase hex string
 */
const generateSectionContentHash = (content) => {
    const canonicalJson = canonicalStringify(content || { type: 'doc', content: [] });
    return crypto.createHash('sha256').update(canonicalJson).digest('hex');
};

/**
 * Compute Git-like commit tree SHA-256 hash across manifest items
 * @param {Array<{ section_id: string, content_hash: string }>} manifestItems
 * @param {string|null} parentCommitHash
 * @param {string} commitMessage
 * @param {string} authorId
 * @returns {string} 64-character lowercase hex string
 */
const generateCommitHash = (manifestItems, parentCommitHash, commitMessage, authorId) => {
    const sortedManifest = [...manifestItems].sort((a, b) =>
        a.section_id.localeCompare(b.section_id)
    );
    const treeManifestString = sortedManifest
        .map((item) => `${item.section_id}:${item.content_hash}`)
        .join('\n');

    const commitPayload = [
        `parent:${parentCommitHash || 'root'}`,
        `author:${authorId}`,
        `message:${commitMessage.trim()}`,
        `tree:\n${treeManifestString}`,
    ].join('\n---\n');

    return crypto.createHash('sha256').update(commitPayload).digest('hex');
};

module.exports = {
    canonicalStringify,
    generateSectionContentHash,
    generateCommitHash,
};
