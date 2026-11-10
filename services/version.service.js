const { withTransaction } = require('../config/db');
const AppError = require('../utils/appError');
const versionModel = require('../models/version.model');
const sectionModel = require('../models/section.model');
const documentModel = require('../models/document.model');
const annotationModel = require('../models/annotation.model');
const activityModel = require('../models/activity.model');
const {
    generateSectionContentHash,
    generateCommitHash,
} = require('../utils/generateHash');

/**
 * Git-like Commit of document changes
 * Executes snapshot deduplication, manifest creation, and change tracking inside a transaction.
 */
const commitDocument = async ({ documentId, commitMessage, versionTag, userId }) => {
    return withTransaction(async (client) => {
        // 1. Lock document row for update
        const document = await versionModel.lockDocumentForUpdate(documentId, client);
        if (!document) {
            throw new AppError('Document not found.', 404);
        }

        const currentVersionId = document.current_version_id;
        let parentVersion = null;
        let previousManifestMap = new Map();

        if (currentVersionId) {
            parentVersion = await versionModel.findById(currentVersionId, client);
            const prevManifest = await versionModel.getVersionManifest(currentVersionId, client);
            for (const item of prevManifest) {
                previousManifestMap.set(item.section_id, item);
            }
        }

        const liveSections = await sectionModel.findByDocumentId(documentId, {
            include_content: true,
        });

        if (liveSections.length === 0) {
            throw new AppError('Cannot commit an empty document. Please create at least one section.', 400);
        }

        // 2. Snapshot sections with deduplication
        const manifestEntries = [];
        const detectedChanges = [];
        const liveSectionIds = new Set();

        for (const section of liveSections) {
            liveSectionIds.add(section.id);
            const contentHash = generateSectionContentHash(section.content);

            const sectionVersionSnapshot = await versionModel.createOrFindSectionSnapshot(
                {
                    section_id: section.id,
                    content_hash: contentHash,
                    section_title: section.section_title,
                    section_number: section.section_number,
                    content: section.content,
                    page_start: section.page_start,
                    page_end: section.page_end,
                    created_by: userId,
                },
                client
            );

            manifestEntries.push({
                section_id: section.id,
                section_version_id: sectionVersionSnapshot.id,
                parent_section_id: section.parent_section_id,
                section_order: section.section_order,
                content_hash: contentHash,
            });

            // Change detection
            const prev = previousManifestMap.get(section.id);
            if (!prev) {
                detectedChanges.push({
                    section_id: section.id,
                    change_type: 'ADDED',
                    old_section_version_id: null,
                    new_section_version_id: sectionVersionSnapshot.id,
                    change_summary: `Section '${section.section_title}' was created.`,
                });
            } else if (prev.content_hash !== contentHash || prev.section_title !== section.section_title) {
                detectedChanges.push({
                    section_id: section.id,
                    change_type: 'UPDATED',
                    old_section_version_id: prev.section_version_id,
                    new_section_version_id: sectionVersionSnapshot.id,
                    change_summary: `Section '${section.section_title}' content was updated.`,
                });
            } else if (
                prev.section_order !== section.section_order ||
                prev.parent_section_id !== section.parent_section_id
            ) {
                detectedChanges.push({
                    section_id: section.id,
                    change_type: 'MOVED',
                    old_section_version_id: prev.section_version_id,
                    new_section_version_id: sectionVersionSnapshot.id,
                    change_summary: `Section '${section.section_title}' was reordered or moved.`,
                });
            }
        }

        // Deleted sections detection
        for (const [prevSectionId, prevItem] of previousManifestMap.entries()) {
            if (!liveSectionIds.has(prevSectionId)) {
                detectedChanges.push({
                    section_id: prevSectionId,
                    change_type: 'DELETED',
                    old_section_version_id: prevItem.section_version_id,
                    new_section_version_id: null,
                    change_summary: `Section '${prevItem.section_title || prevSectionId}' was deleted.`,
                });
            }
        }

        // 3. Compute deterministic Git-like SHA-256 commit hash
        const commitHash = generateCommitHash(
            manifestEntries,
            parentVersion?.commit_hash || null,
            commitMessage,
            userId
        );

        const nextVersionNumber = parentVersion ? parentVersion.version_number + 1 : 1;

        // 4. Create immutable version record
        const versionRecord = await versionModel.createVersion(
            {
                document_id: documentId,
                parent_version_id: currentVersionId || null,
                version_number: nextVersionNumber,
                version_tag: versionTag || null,
                commit_hash: commitHash,
                commit_message: commitMessage.trim(),
                committed_by: userId,
            },
            client
        );

        // 5. Insert manifest links
        await versionModel.createVersionManifest(versionRecord.id, manifestEntries, client);

        // 6. Record changes in change log
        if (detectedChanges.length > 0) {
            await versionModel.recordVersionChanges(versionRecord.id, detectedChanges, client);
        }

        // 7. Update document's current version pointer
        await versionModel.updateDocumentCurrentVersion(documentId, versionRecord.id, userId, client);

        // 8. Snapshot active annotations
        const liveAnnotations = await annotationModel.findByDocumentId(documentId);
        if (liveAnnotations && liveAnnotations.length > 0) {
            await versionModel.snapshotAnnotationsForVersion(versionRecord.id, liveAnnotations, client);
        }

        // 9. Append audit log
        await activityModel.logActivity(
            {
                document_id: documentId,
                library_id: document.library_id,
                activity_type: 'VERSION_COMMITTED',
                entity_type: 'version',
                entity_id: versionRecord.id,
                description: `Version v${nextVersionNumber} committed: ${commitMessage}`,
                metadata: {
                    commit_hash: commitHash,
                    sections_count: manifestEntries.length,
                    changes_count: detectedChanges.length,
                },
                actor_id: userId,
            },
            client
        );

        return {
            ...versionRecord,
            section_count: manifestEntries.length,
            changes_count: detectedChanges.length,
            changes: detectedChanges,
        };
    });
};

/**
 * Compare two document versions and generate comprehensive diff
 */
const compareVersions = async ({ versionId1, versionId2 }) => {
    const v1 = await versionModel.findById(versionId1);
    const v2 = await versionModel.findById(versionId2);

    if (!v1 || !v2) {
        throw new AppError('One or both specified versions could not be found.', 404);
    }

    if (v1.document_id !== v2.document_id) {
        throw new AppError('Cannot compare versions across different documents.', 400);
    }

    const m1 = await versionModel.getVersionManifest(versionId1);
    const m2 = await versionModel.getVersionManifest(versionId2);

    const map1 = new Map(m1.map((item) => [item.section_id, item]));
    const map2 = new Map(m2.map((item) => [item.section_id, item]));

    const added = [];
    const updated = [];
    const deleted = [];
    const moved = [];
    const unchanged = [];

    for (const [secId, item2] of map2.entries()) {
        const item1 = map1.get(secId);
        if (!item1) {
            added.push({
                section_id: secId,
                section_title: item2.section_title,
                section_number: item2.section_number,
                content: item2.content,
            });
        } else if (item1.content_hash !== item2.content_hash) {
            updated.push({
                section_id: secId,
                section_title: item2.section_title,
                old_title: item1.section_title,
                old_hash: item1.content_hash,
                new_hash: item2.content_hash,
                old_content: item1.content,
                new_content: item2.content,
            });
        } else if (
            item1.section_order !== item2.section_order ||
            item1.parent_section_id !== item2.parent_section_id
        ) {
            moved.push({
                section_id: secId,
                section_title: item2.section_title,
                old_order: item1.section_order,
                new_order: item2.section_order,
                old_parent_id: item1.parent_section_id,
                new_parent_id: item2.parent_section_id,
            });
        } else {
            unchanged.push({
                section_id: secId,
                section_title: item2.section_title,
            });
        }
    }

    for (const [secId, item1] of map1.entries()) {
        if (!map2.has(secId)) {
            deleted.push({
                section_id: secId,
                section_title: item1.section_title,
                section_number: item1.section_number,
            });
        }
    }

    return {
        v1: { id: v1.id, version_number: v1.version_number, commit_hash: v1.commit_hash },
        v2: { id: v2.id, version_number: v2.version_number, commit_hash: v2.commit_hash },
        summary: {
            added_count: added.length,
            updated_count: updated.length,
            deleted_count: deleted.length,
            moved_count: moved.length,
            unchanged_count: unchanged.length,
        },
        changes: {
            added,
            updated,
            deleted,
            moved,
            unchanged,
        },
    };
};

/**
 * Restore an older version non-destructively by creating a new commit
 */
const restoreVersion = async ({ targetVersionId, documentId, commitMessage, userId }) => {
    return withTransaction(async (client) => {
        const targetVersion = await versionModel.findById(targetVersionId, client);
        if (!targetVersion) {
            throw new AppError('Target version to restore was not found.', 404);
        }

        if (targetVersion.document_id !== documentId) {
            throw new AppError('Target version does not belong to this document.', 400);
        }

        const targetManifest = await versionModel.getVersionManifest(targetVersionId, client);
        if (targetManifest.length === 0) {
            throw new AppError('Target version contains no section manifest entries.', 400);
        }

        const liveSections = await sectionModel.findByDocumentId(documentId);
        const liveSectionMap = new Map(liveSections.map((s) => [s.id, s]));

        for (const item of targetManifest) {
            const existing = liveSectionMap.get(item.section_id);
            const formattedContent = typeof item.content === 'string'
                ? item.content
                : JSON.stringify(item.content || {});

            if (existing) {
                await client.query(
                    `UPDATE document_management.document_sections
                     SET section_title = $1, section_number = $2, section_order = $3,
                         parent_section_id = $4, content = $5, page_start = $6, page_end = $7,
                         lock_version = lock_version + 1, updated_by = $8, updated_at = NOW(),
                         deleted_at = NULL
                     WHERE id = $9;`,
                    [
                        item.section_title,
                        item.section_number || null,
                        item.section_order ?? 0,
                        item.parent_section_id || null,
                        formattedContent,
                        item.page_start || null,
                        item.page_end || null,
                        userId,
                        item.section_id,
                    ]
                );
                liveSectionMap.delete(item.section_id);
            } else {
                await client.query(
                    `INSERT INTO document_management.document_sections (
                       id, document_id, parent_section_id, section_title, section_number,
                       section_order, content, page_start, page_end, created_by, updated_by
                     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
                     ON CONFLICT (id) DO UPDATE SET
                       section_title = EXCLUDED.section_title,
                       content = EXCLUDED.content,
                       deleted_at = NULL;`,
                    [
                        item.section_id,
                        documentId,
                        item.parent_section_id || null,
                        item.section_title,
                        item.section_number || null,
                        item.section_order ?? 0,
                        formattedContent,
                        item.page_start || null,
                        item.page_end || null,
                        userId,
                    ]
                );
            }
        }

        // Soft-delete sections that were not present in target version
        for (const [secId] of liveSectionMap.entries()) {
            await client.query(
                `UPDATE document_management.document_sections SET deleted_at = NOW(), updated_by = $1 WHERE id = $2;`,
                [userId, secId]
            );
        }

        // Commit restored state
        const restoreMsg =
            commitMessage ||
            `Restored state from Version v${targetVersion.version_number} (${targetVersion.commit_hash.slice(0, 8)})`;

        return commitDocument({
            documentId,
            commitMessage: restoreMsg,
            versionTag: `restored-v${targetVersion.version_number}`,
            userId,
        });
    });
};

module.exports = {
    commitDocument,
    compareVersions,
    restoreVersion,
};
