const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/appError');
const { sendSuccess } = require('../utils/response');
const documentModel = require('../models/document.model');
const libraryModel = require('../models/library.model');
const activityModel = require('../models/activity.model');
const { sendNotificationToMany, sendNotificationToSingle, sendNotificationToAll } = require('../services/notification.service');
const rbacModel = require('../models/rbac.model');
const templateModel = require('../models/template.model');
const aiExtractionService = require('../services/aiExtraction.service');
const pool = require('../config/db');

const createDocument = asyncHandler(async (req, res) => {
    const user = req.user;
    const userId = user?.id;
    const {
        library_id,
        document_name,
        description,
        document_type = 'policy',
        source_type = 'template',
        sections = [],
        status = 'draft',
    } = req.body;

    const library = await libraryModel.findById(library_id);
    if (!library) {
        throw new AppError('Specified library does not exist.', 404);
    }

    const document = await documentModel.create({
        library_id,
        document_name: document_name.trim(),
        description: description ? description.trim() : null,
        document_type,
        source_type,
        status: status || 'draft',
        sections,
        created_by: userId,
        updated_by: userId,
        requested_by: userId,
    });

    await activityModel.logActivity({
        document_id: document.id,
        library_id: document.library_id,
        activity_type: 'DOCUMENT_CREATED',
        entity_type: 'document',
        entity_id: document.id,
        description: `Operational policy '${document.document_name}' was saved as draft.`,
        actor_id: userId,
    });

    // Notify Approvers (Super Admins + Users with approval in Permission Matrix) & Confirm to Author
    setImmediate(async () => {
        try {
            const approvers = await rbacModel.getUsersWithPermission('documents', 'approval').catch(() => []);
            const approverIds = approvers.filter(id => id !== userId);

            if (approverIds.length > 0) {
                await sendNotificationToMany({
                    userIds: approverIds,
                    title: 'New Policy Submitted for Review',
                    body: `${user?.name || 'A user'} submitted "${document.document_name}" for review and approval.`,
                    data: {
                        type: 'policy_draft_submitted',
                        document_id: document.id,
                        clickAction: '/change-management',
                    },
                    clickAction: '/change-management',
                });
            }

            if (userId) {
                await sendNotificationToSingle({
                    userId,
                    title: 'Policy Draft Submitted',
                    body: `Your operational policy "${document.document_name}" has been saved as draft and submitted for review.`,
                    data: {
                        type: 'policy_draft_saved',
                        document_id: document.id,
                        clickAction: '/change-management',
                    },
                    clickAction: '/change-management',
                });
            }
        } catch (nErr) {
            console.error('[Document] Failed sending draft notifications:', nErr.message);
        }
    });

    return sendSuccess(res, 'Operational policy saved as draft successfully', document, 201);
});

const getDocumentById = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const user = req.user;
    const isSuperAdmin = user?.isSuperAdmin || (user?.roles || []).some(r => {
        const name = typeof r === 'string' ? r : r.role_name;
        return name?.toLowerCase() === 'super admin';
    });

    const document = await documentModel.findById(id);

    if (!document) {
        throw new AppError('Document not found.', 404);
    }

    if (!isSuperAdmin && user?.id) {
        const specificAccess = await documentModel.getPolicyUserAccess(id);
        const userGrant = specificAccess.find(a => a.user_id === user.id);
        if (userGrant && userGrant.can_view === false) {
            throw new AppError('You do not have permission to view this policy.', 403);
        }
    }

    if (req.user?.id) {
        document.is_pinned = await documentModel.isPolicyPinned(req.user.id, id);
    } else {
        document.is_pinned = false;
    }

    return sendSuccess(res, 'Document retrieved successfully', document);
});

const getAllDocuments = asyncHandler(async (req, res) => {
    const user = req.user;
    const isSuperAdmin = user?.isSuperAdmin || (user?.roles || []).some(r => {
        const name = typeof r === 'string' ? r : r.role_name;
        return name?.toLowerCase() === 'super admin';
    });
    const canApprove = isSuperAdmin || (user?.permissions || []).includes('documents:approval');

    const { library_id, status, document_type, search, page = 1, limit = 50, scope, for_change_management } = req.query;
    const offset = (page - 1) * limit;

    const isChangeManagement = scope === 'change_management' || for_change_management === true || for_change_management === 'true';

    const { documents, total } = await documentModel.findAll({
        library_id,
        status,
        document_type,
        search,
        user_id: user?.id,
        isSuperAdmin,
        canApprove,
        isChangeManagement,
        limit,
        offset,
    });

    const totalPages = Math.ceil(total / limit) || 1;

    return sendSuccess(res, 'Documents retrieved successfully', documents, 200, {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages,
    });
});

const getDocumentsByLibrary = asyncHandler(async (req, res) => {
    const { id: libraryId } = req.params;
    const { status, document_type, search, page = 1, limit = 20 } = req.query;
    const user = req.user;
    const isSuperAdmin = user?.isSuperAdmin || (user?.roles || []).some(r => {
        const name = typeof r === 'string' ? r : r.role_name;
        return name?.toLowerCase() === 'super admin';
    });
    const canApprove = isSuperAdmin || (user?.permissions || []).includes('documents:approval');

    const library = await libraryModel.findById(libraryId);
    if (!library) {
        throw new AppError('Library not found.', 404);
    }

    const offset = (page - 1) * limit;

    const { documents, total } = await documentModel.findAll({
        library_id: libraryId,
        status,
        document_type,
        search,
        user_id: user?.id,
        isSuperAdmin,
        canApprove,
        limit,
        offset,
    });

    const totalPages = Math.ceil(total / limit) || 1;

    return sendSuccess(res, 'Library documents retrieved successfully', documents, 200, {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages,
    });
});

const updateDocument = asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    const { id } = req.params;

    const existing = await documentModel.findById(id);
    if (!existing) {
        throw new AppError('Document not found.', 404);
    }

    const updated = await documentModel.update(id, req.body, userId);

    await activityModel.logActivity({
        document_id: id,
        library_id: existing.library_id,
        activity_type: 'DOCUMENT_UPDATED',
        entity_type: 'document',
        entity_id: id,
        description: `Document '${updated.document_name}' details were updated.`,
        actor_id: userId,
    });

    return sendSuccess(res, 'Document updated successfully', updated);
});

const deleteDocument = asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    const { id } = req.params;

    const existing = await documentModel.findById(id);
    if (!existing) {
        throw new AppError('Document not found.', 404);
    }

    const deleted = await documentModel.softDelete(id, userId);

    await activityModel.logActivity({
        document_id: id,
        library_id: existing.library_id,
        activity_type: 'DOCUMENT_DELETED',
        entity_type: 'document',
        entity_id: id,
        description: `Document '${existing.document_name}' was deleted.`,
        actor_id: userId,
    });

    return sendSuccess(res, 'Document deleted successfully', deleted);
});

const moveDocument = asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    const { id } = req.params;
    const { target_library_id } = req.body;

    const document = await documentModel.findById(id);
    if (!document) {
        throw new AppError('Document not found.', 404);
    }

    const targetLibrary = await libraryModel.findById(target_library_id);
    if (!targetLibrary) {
        throw new AppError('Target library does not exist.', 404);
    }

    const moved = await documentModel.move(id, target_library_id, userId);

    await activityModel.logActivity({
        document_id: id,
        library_id: target_library_id,
        activity_type: 'DOCUMENT_MOVED',
        entity_type: 'document',
        entity_id: id,
        description: `Document '${moved.document_name}' moved to library '${targetLibrary.library_name}'.`,
        metadata: { from_library_id: document.library_id, to_library_id: target_library_id },
        actor_id: userId,
    });

    return sendSuccess(res, 'Document moved successfully', moved);
});

const searchDocuments = asyncHandler(async (req, res) => {
    const { q, library_id, page = 1, limit = 20 } = req.query;
    const user = req.user;
    const isSuperAdmin = user?.isSuperAdmin || (user?.roles || []).some(r => {
        const name = typeof r === 'string' ? r : r.role_name;
        return name?.toLowerCase() === 'super admin';
    });
    const canApprove = isSuperAdmin || (user?.permissions || []).includes('documents:approval');
    const offset = (page - 1) * limit;

    const { documents, total } = await documentModel.findAll({
        search: q,
        library_id,
        status: 'all',
        user_id: user?.id,
        isSuperAdmin,
        canApprove,
        limit,
        offset,
    });

    const totalPages = Math.ceil(total / limit) || 1;

    return sendSuccess(res, 'Document search results retrieved successfully', documents, 200, {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages,
    });
});

const getDocumentMetadata = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const user = req.user;
    const isSuperAdmin = user?.isSuperAdmin || (user?.roles || []).some(r => {
        const name = typeof r === 'string' ? r : r.role_name;
        return name?.toLowerCase() === 'super admin';
    });

    const metadata = await documentModel.getCompleteMetadata(id, user?.id, isSuperAdmin);

    if (!metadata) {
        throw new AppError('Document not found.', 404);
    }

    if (!isSuperAdmin && metadata.can_view === false) {
        throw new AppError('You do not have permission to view this policy.', 403);
    }

    return sendSuccess(res, 'Document metadata retrieved successfully', metadata);
});

// Approval or rejection for drafted operational policies & revisions
const reviewDocument = asyncHandler(async (req, res) => {
    const user = req.user;
    const isSuperAdmin = user?.isSuperAdmin || (user?.roles || []).some(r => {
        const name = typeof r === 'string' ? r : r.role_name;
        return name?.toLowerCase() === 'super admin';
    });
    const canApprove = isSuperAdmin || (user?.permissions || []).includes('documents:approval');

    if (!canApprove) {
        throw new AppError('You do not have permission to approve or reject operational policies.', 403);
    }

    const { id } = req.params;
    const { action, rejection_reason, commit_message } = req.body; // 'approve' | 'reject'

    if (!['approve', 'reject'].includes(action)) {
        throw new AppError('Action must be "approve" or "reject".', 400);
    }

    const document = await documentModel.findById(id);
    if (!document) throw new AppError('Document not found.', 404);

    let updatedDoc;

    // On approval: promote revision snapshot to active live version
    if (action === 'approve') {
        updatedDoc = await documentModel.approveRevision(id, user.id, {
            commit_message: commit_message || `Approved & published to Master Library by ${user.name || 'Super Admin'}`,
        });
    } else if (action === 'reject') {
        // If this is a revision of an already-live policy:
        // Do NOT unpublish the active policy! Keep it 'active' so all users continue to see it.
        // Discard or archive the pending revision draft and reset draft_content.
        if (document.live_version_id || document.has_pending_revision) {
            await documentModel.rejectPendingRevision(id, rejection_reason);
        } else {
            await documentModel.updateStatus(id, {
                status: 'rejected',
                rejection_reason,
            });
        }
        updatedDoc = await documentModel.findById(id);
    }

    const updated = updatedDoc || (await documentModel.findById(id));

    // ── Dispatch notifications ───────────────────────────────────────────────
    setImmediate(async () => {
        try {
            const authorId = document.pending_revision_by || document.requested_by || document.created_by;

            if (action === 'approve') {
                // 1. Notify who created this policy or draft: "Your policy was approved"
                if (authorId) {
                    await sendNotificationToSingle({
                        userId: authorId,
                        title: 'Policy Approved & Published',
                        body: `Your policy "${document.document_name}" has been approved and published to the Master Library.`,
                        data: {
                            type: 'policy_approved',
                            document_id: id,
                            clickAction: '/master-library',
                        },
                        clickAction: '/master-library',
                    }).catch(err => console.error('[Document] Failed to notify author on approve:', err.message));
                }

                // 2. Broadcast to ALL active users: New policy or version is in live
                const versionNum = updated?.current_version_number || updated?.version_number || '1.0';
                await sendNotificationToAll({
                    title: `New Policy Live: ${document.document_name}`,
                    body: `Policy "${document.document_name}" (v${versionNum}) is now approved and live in the Master Library.`,
                    data: {
                        type: 'policy_live',
                        document_id: id,
                        clickAction: '/master-library',
                    },
                    clickAction: '/master-library',
                }).catch(err => console.error('[Document] Failed to broadcast live policy notification:', err.message));

            } else if (action === 'reject') {
                // Notify who created this policy or draft: "Your policy was rejected"
                if (authorId) {
                    await sendNotificationToSingle({
                        userId: authorId,
                        title: 'Policy Review: Rejected',
                        body: `Your policy "${document.document_name}" was rejected.${rejection_reason ? ' Reason: ' + rejection_reason : ''}`,
                        data: {
                            type: 'policy_rejected',
                            document_id: id,
                            clickAction: '/change-management',
                        },
                        clickAction: '/change-management',
                    }).catch(err => console.error('[Document] Failed to notify author on reject:', err.message));
                }
            }
        } catch (notifErr) {
            console.error('[Document] Review notification dispatch error:', notifErr.message);
        }
    });

    return sendSuccess(res, `Policy ${action === 'approve' ? 'approved & published' : 'rejected'} successfully`, updated);
});

// Policy-Specific User-Level Access Controls
const getPolicyAccess = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const accessList = await documentModel.getPolicyUserAccess(id);
    return sendSuccess(res, 'Policy user access retrieved', accessList);
});

const updatePolicyAccess = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { user_id, can_view, can_edit } = req.body;
    const adminId = req.user?.id;

    if (!user_id) throw new AppError('user_id is required', 400);

    const record = await documentModel.setPolicyUserAccess(id, user_id, {
        can_view: can_view ?? true,
        can_edit: can_edit ?? false,
        granted_by: adminId,
    });

    return sendSuccess(res, 'Policy user access updated', record);
});

// ── User-Centric Policy Access: GET all policies for a specific user ──
const getUserPolicyAccessList = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    if (!userId) throw new AppError('userId is required', 400);

    const list = await documentModel.getUserPolicyAccess(userId);
    return sendSuccess(res, 'User policy access list retrieved', list);
});

// ── User-Centric Policy Access: Bulk save all policy access for a user ──
const bulkUpdateUserPolicyAccess = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const { policies } = req.body; // [{ document_id, can_view, can_edit }]
    const adminId = req.user?.id;

    if (!userId) throw new AppError('userId is required', 400);
    if (!Array.isArray(policies)) throw new AppError('policies must be an array', 400);

    const results = await documentModel.bulkSetUserPolicyAccess(userId, policies, adminId);
    return sendSuccess(res, `Updated access for ${results.length} policies`, results);
});

// ── Version Control Controllers ──

// POST /:id/create-revision — User clicks Configure on a live policy
const createRevision = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const user = req.user;
    const userId = user?.id;
    const { commit_message, bumpType = 'minor' } = req.body;

    const isSuperAdmin = user?.isSuperAdmin || (user?.roles || []).some(r => {
        const name = typeof r === 'string' ? r : r.role_name;
        return name?.toLowerCase() === 'super admin';
    });

    const document = await documentModel.findById(id);
    if (!document) throw new AppError('Document not found.', 404);

    // Check permission: Super Admin OR explicit can_edit grant in policy_user_access OR the doc creator
    if (!isSuperAdmin) {
        const isDocCreator = document.created_by === userId || document.requested_by === userId;
        if (!isDocCreator) {
            const accessRows = await documentModel.getPolicyUserAccess(id);
            const userGrant = accessRows.find(a => a.user_id === userId);
            if (!userGrant || !userGrant.can_edit) {
                throw new AppError('You do not have permission to edit or revise this policy.', 403);
            }
        }
    }

    const snapshot = await documentModel.createVersionSnapshot(id, userId, {
        commit_message: commit_message || `Revision started by ${user?.name || 'User'}`,
        version_tag: 'revision',
        bumpType,
        isLiveApproval: false, // KEEP LIVE VERSION ACTIVE FOR ALL USERS!
    });

    // Notice: we DO NOT set status = 'draft' on the live document!
    // The policy remains 'active' in the Master Library for all users.
    // Instead, has_pending_revision = true signals that a revision draft is ongoing.

    await activityModel.logActivity({
        document_id: id,
        library_id: document.library_id,
        activity_type: 'VERSION_REVISION_STARTED',
        entity_type: 'document',
        entity_id: id,
        description: `Revision draft v${snapshot.version_number} started. Live version remains visible.`,
        actor_id: userId,
    });

    return sendSuccess(res, 'Revision snapshot created successfully', snapshot, 201);
});

// PUT /:id/sections — Save section edits during draft
const saveSectionEdits = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const user = req.user;
    const userId = user?.id;
    const { sections, isDraftOnly = true } = req.body;

    if (!Array.isArray(sections) || sections.length === 0) {
        throw new AppError('sections must be a non-empty array', 400);
    }

    const isSuperAdmin = user?.isSuperAdmin || (user?.roles || []).some(r => {
        const name = typeof r === 'string' ? r : r.role_name;
        return name?.toLowerCase() === 'super admin';
    });

    const document = await documentModel.findById(id);
    if (!document) throw new AppError('Document not found.', 404);

    if (!isSuperAdmin) {
        // If the user is the creator/author of the document, they can always edit their own draft
        const isDocCreator = document.created_by === userId || document.requested_by === userId || document.pending_revision_by === userId;
        if (!isDocCreator) {
            const accessRows = await documentModel.getPolicyUserAccess(id);
            const userGrant = accessRows.find(a => a.user_id === userId);
            if (!userGrant || !userGrant.can_edit) {
                throw new AppError('You do not have permission to edit this policy.', 403);
            }
        }
    }

    // Save strictly to draft_content so live users continue seeing current published version
    const updated = await documentModel.updateSections(id, sections, userId, isDraftOnly);
    return sendSuccess(res, `${updated.length} section(s) saved successfully`, updated);
});

// GET /:id/versions — Version history list
const getVersionHistory = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const history = await documentModel.getVersionHistory(id);
    return sendSuccess(res, 'Version history retrieved', history);
});

// GET /:id/versions/:versionId/sections — Sections for a specific historical version
const getVersionSections = asyncHandler(async (req, res) => {
    const { versionId } = req.params;
    const sections = await documentModel.getVersionSections(versionId);
    return sendSuccess(res, 'Version sections retrieved', sections);
});

// POST /:id/submit-revision — Submit revision draft for Super Admin review
const submitRevisionForReview = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const user = req.user;
    const userId = user?.id;

    const document = await documentModel.findById(id);
    if (!document) throw new AppError('Document not found.', 404);

    const isSuperAdmin = user?.isSuperAdmin || (user?.roles || []).some(r => {
        const name = typeof r === 'string' ? r : r.role_name;
        return name?.toLowerCase() === 'super admin';
    });

    if (!isSuperAdmin) {
        // The revision author or document creator can always submit
        const isDocCreator = document.created_by === userId || document.requested_by === userId || document.pending_revision_by === userId;
        if (!isDocCreator) {
            const accessRows = await documentModel.getPolicyUserAccess(id);
            const userGrant = accessRows.find(a => a.user_id === userId);
            if (!userGrant || !userGrant.can_edit) {
                throw new AppError('You do not have permission to submit revisions for this policy.', 403);
            }
        }
    }

    const { commit_message } = req.body || {};

    // Update the pending revision version's commit message if provided
    if (commit_message && document.pending_revision_id) {
        await pool.query(
            `UPDATE document_management.document_versions
             SET commit_message = $1
             WHERE id = $2`,
            [commit_message, document.pending_revision_id]
        );
    }

    // Set revision_status to 'pending_review'
    await pool.query(
        `UPDATE document_management.documents
         SET revision_status = 'pending_review',
             updated_at = NOW()
         WHERE id = $1`,
        [id]
    );

    await activityModel.logActivity({
        document_id: id,
        library_id: document.library_id,
        activity_type: 'REVISION_SUBMITTED_FOR_REVIEW',
        entity_type: 'document',
        entity_id: id,
        description: `Revision draft v${document.pending_revision_version || ''} submitted for Super Admin review by ${user?.name || 'User'}.`,
        actor_id: userId,
    });

    // Notify Approvers (Super Admins + users with approval permission in matrix) & Confirm to Submitter
    setImmediate(async () => {
        try {
            const approvers = await rbacModel.getUsersWithPermission('documents', 'approval').catch(() => []);
            const approverIds = approvers.filter(saId => saId !== userId);

            if (approverIds.length > 0) {
                await sendNotificationToMany({
                    userIds: approverIds,
                    title: 'Policy Revision Submitted for Review',
                    body: `${user?.name || 'A user'} submitted revision v${document.pending_revision_version || 'new'} of "${document.document_name}" for approval review.`,
                    data: {
                        type: 'policy_revision_submitted',
                        document_id: document.id,
                        clickAction: '/change-management',
                    },
                    clickAction: '/change-management',
                });
            }

            if (userId) {
                await sendNotificationToSingle({
                    userId,
                    title: 'Revision Submitted for Review',
                    body: `Your revision v${document.pending_revision_version || 'new'} of "${document.document_name}" has been submitted for approval review.`,
                    data: {
                        type: 'policy_revision_submitted_confirm',
                        document_id: document.id,
                        clickAction: '/change-management',
                    },
                    clickAction: '/change-management',
                });
            }
        } catch (e) {
            console.error('Failed to dispatch revision notifications:', e);
        }
    });

    return sendSuccess(res, 'Revision draft submitted for Super Admin review.', {
        document_id: id,
        revision_status: 'pending_review'
    });
});

// POST /:id/discard-revision — Discard an in-progress draft revision
const discardRevision = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const user = req.user;
    const userId = user?.id;

    const document = await documentModel.findById(id);
    if (!document) throw new AppError('Document not found.', 404);

    const isSuperAdmin = user?.isSuperAdmin || (user?.roles || []).some(r => {
        const name = typeof r === 'string' ? r : r.role_name;
        return name?.toLowerCase() === 'super admin';
    });

    const isAuthor = document.pending_revision_by === userId || document.created_by === userId;
    if (!isSuperAdmin && !isAuthor) {
        throw new AppError('You do not have permission to discard this revision draft.', 403);
    }

    await documentModel.discardPendingRevision(id);

    await activityModel.logActivity({
        document_id: id,
        library_id: document.library_id,
        activity_type: 'REVISION_DISCARDED',
        entity_type: 'document',
        entity_id: id,
        description: `Revision draft was discarded.`,
        actor_id: userId,
    });

    return sendSuccess(res, 'Revision draft discarded successfully');
});

// POST /:id/request-removal — User requests policy removal (Maker)
const requestPolicyRemoval = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const user = req.user;
    const userId = user?.id;
    const { reason } = req.body || {};

    if (!reason || !reason.trim()) {
        throw new AppError('A justification/reason is required to request policy removal.', 400);
    }

    const isSuperAdmin = user?.isSuperAdmin || (user?.roles || []).some(r => {
        const name = typeof r === 'string' ? r : r.role_name;
        return name?.toLowerCase() === 'super admin';
    });

    const document = await documentModel.findById(id);
    if (!document) throw new AppError('Document not found.', 404);

    if (document.status === 'suspended') {
        throw new AppError('This policy has already been suspended.', 400);
    }
    if (document.pending_removal) {
        throw new AppError('A removal request is already pending review for this policy.', 400);
    }

    // Check permission: Super Admin OR explicit can_delete grant
    if (!isSuperAdmin) {
        const accessRows = await documentModel.getPolicyUserAccess(id);
        const userGrant = accessRows.find(a => a.user_id === userId);
        if (!userGrant || !userGrant.can_delete) {
            throw new AppError('You do not have permission to request removal of this policy.', 403);
        }
    }

    const updated = await documentModel.requestPolicyRemoval(id, userId, reason.trim());

    await activityModel.logActivity({
        document_id: id,
        library_id: document.library_id,
        activity_type: 'POLICY_REMOVAL_REQUESTED',
        entity_type: 'document',
        entity_id: id,
        description: `Policy removal requested by ${user?.name || 'User'}. Reason: ${reason.trim()}`,
        actor_id: userId,
    });

    // Notify Super Admins
    setImmediate(async () => {
        try {
            const saRes = await pool.query("SELECT user_id AS id FROM public.user_roles WHERE role_id = 1");
            const saIds = saRes.rows.map(r => r.id).filter(saId => saId !== userId);
            if (saIds.length > 0) {
                await sendNotificationToMany({
                    userIds: saIds,
                    title: '🗑️ Policy Removal Requested',
                    body: `${user?.name || 'A user'} has requested removal of policy "${document.document_name}". Review in Change Management.`,
                    data: { type: 'policy_removal_requested', document_id: id },
                    clickAction: '/change-management',
                });
            }
        } catch (e) {
            console.error('Failed to send removal notification:', e);
        }
    });

    return sendSuccess(res, 'Policy removal request submitted for Super Admin review.', updated);
});

// PATCH /:id/review-removal — Super Admin approves or rejects removal (Checker)
const reviewPolicyRemoval = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const user = req.user;
    const userId = user?.id;
    const { action, feedback } = req.body || {};

    if (!['approve', 'reject'].includes(action)) {
        throw new AppError('Action must be "approve" or "reject".', 400);
    }

    const isSuperAdmin = user?.isSuperAdmin || (user?.roles || []).some(r => {
        const name = typeof r === 'string' ? r : r.role_name;
        return name?.toLowerCase() === 'super admin';
    });
    if (!isSuperAdmin) {
        throw new AppError('Only Super Admins can review policy removal requests.', 403);
    }

    const document = await documentModel.findById(id);
    if (!document) throw new AppError('Document not found.', 404);
    if (!document.pending_removal) {
        throw new AppError('No pending removal request found for this policy.', 400);
    }

    const updated = await documentModel.reviewPolicyRemoval(id, userId, { action, feedback });

    await activityModel.logActivity({
        document_id: id,
        library_id: document.library_id,
        activity_type: action === 'approve' ? 'POLICY_REMOVAL_APPROVED' : 'POLICY_REMOVAL_REJECTED',
        entity_type: 'document',
        entity_id: id,
        description: action === 'approve'
            ? `Policy removal approved by ${user?.name || 'Super Admin'}. Policy suspended.`
            : `Policy removal rejected by ${user?.name || 'Super Admin'}. Policy remains active.`,
        actor_id: userId,
    });

    // Notify the user who requested removal
    if (document.removal_requested_by) {
        setImmediate(async () => {
            try {
                await sendNotificationToSingle({
                    userId: document.removal_requested_by,
                    title: action === 'approve' ? ' Policy Removal Approved' : ' Policy Removal Rejected',
                    body: action === 'approve'
                        ? `Your request to remove policy "${document.document_name}" has been approved. The policy is now suspended.`
                        : `Your request to remove policy "${document.document_name}" was rejected. ${feedback ? 'Reason: ' + feedback : ''}`,
                    data: {
                        type: action === 'approve' ? 'policy_removal_approved' : 'policy_removal_rejected',
                        document_id: id,
                        clickAction: '/change-management',
                    },
                    clickAction: '/change-management',
                });
            } catch (err) {
                console.error('[Document] Failed to notify removal requester:', err.message);
            }
        });
    }

    return sendSuccess(res,
        action === 'approve'
            ? 'Policy removal approved. Policy is now suspended and hidden from Master Library.'
            : 'Policy removal rejected. Policy remains active.',
        updated
    );
});

// GET /pending-removals — Super Admin: get all pending policy removal requests
const getPendingPolicyRemovals = asyncHandler(async (req, res) => {
    const user = req.user;
    const isSuperAdmin = user?.isSuperAdmin || (user?.roles || []).some(r => {
        const name = typeof r === 'string' ? r : r.role_name;
        return name?.toLowerCase() === 'super admin';
    });
    if (!isSuperAdmin) {
        throw new AppError('Only Super Admins can view pending policy removals.', 403);
    }
    const list = await documentModel.getPendingPolicyRemovals();
    return sendSuccess(res, 'Pending policy removals retrieved', list);
});

// ── USER PINNED POLICIES ──

const getPinnedDocuments = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const pinned = await documentModel.getPinnedPolicies(userId);
    return sendSuccess(res, 'Pinned policies retrieved successfully', pinned);
});

const pinDocument = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;

    const doc = await documentModel.findById(id);
    if (!doc) throw new AppError('Policy not found.', 404);

    await documentModel.pinPolicy(userId, id);
    return sendSuccess(res, 'Policy pinned successfully', { id, is_pinned: true });
});

const unpinDocument = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;

    await documentModel.unpinPolicy(userId, id);
    return sendSuccess(res, 'Policy unpinned successfully', { id, is_pinned: false });
});

const getDocumentPinStatus = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;

    const isPinned = await documentModel.isPolicyPinned(userId, id);
    return sendSuccess(res, 'Policy pin status retrieved', { id, is_pinned: isPinned });
});

// POST /ai-extract — Parse uploaded file (PDF / DOCX) and format with Groq AI according to selected template
const extractAndFormatPolicyWithAI = asyncHandler(async (req, res) => {
    let fileBuffer = null;
    let mimeType = '';
    let fileName = '';

    // Check if uploaded via multer (multipart/form-data)
    if (req.file) {
        fileBuffer = req.file.buffer;
        mimeType = req.file.mimetype;
        fileName = req.file.originalname;
    } else if (req.body.fileData) {
        // Base64 file upload support
        const base64Data = req.body.fileData.replace(/^data:([A-Za-z-+/]+);base64,/, '');
        fileBuffer = Buffer.from(base64Data, 'base64');
        mimeType = req.body.mimeType || 'application/pdf';
        fileName = req.body.fileName || 'uploaded-policy.pdf';
    }

    if (!fileBuffer) {
        throw new AppError('No document file was provided for extraction.', 400);
    }

    const useTemplate = req.body.useTemplate !== 'false' && req.body.useTemplate !== false;
    const { templateId } = req.body;
    let targetTemplate = null;
    if (useTemplate) {
        if (templateId) {
            targetTemplate = await templateModel.findById(templateId).catch(() => null);
        }
        if (!targetTemplate) {
            const { templates } = await templateModel.findAll({ status: 'approved', limit: 1 });
            targetTemplate = templates?.[0] || null;
        }
    }

    // 1. Extract raw text, tables, and images sequentially from file
    const rawResult = await aiExtractionService.extractRawTextFromFile(fileBuffer, mimeType, fileName);

    if (!rawResult.text || !rawResult.text.trim()) {
        throw new AppError('Could not extract any readable text from the uploaded document.', 400);
    }

    // 2. Transform text using Groq Cloud AI with extracted tables & images
    const aiResult = await aiExtractionService.transformTextWithTemplate(
        rawResult.text,
        targetTemplate,
        useTemplate,
        rawResult.images || [],
        rawResult.tables || []
    );

    return sendSuccess(res, 'Policy extracted and formatted successfully', {
        source_file_name: fileName,
        source_type: rawResult.source_type,
        applied_template: targetTemplate ? {
            id: targetTemplate.id,
            template_id: targetTemplate.template_id,
            template_name: targetTemplate.template_name,
        } : null,
        raw_text: rawResult.text,
        raw_html: rawResult.html,
        images: rawResult.images || [],
        tables: rawResult.tables || [],
        extracted: aiResult,
    });
});

module.exports = {
    createDocument,
    getDocumentById,
    getAllDocuments,
    getDocumentsByLibrary,
    updateDocument,
    deleteDocument,
    moveDocument,
    searchDocuments,
    getDocumentMetadata,
    reviewDocument,
    getPolicyAccess,
    updatePolicyAccess,
    getUserPolicyAccessList,
    bulkUpdateUserPolicyAccess,
    createRevision,
    submitRevisionForReview,
    discardRevision,
    saveSectionEdits,
    getVersionHistory,
    getVersionSections,
    requestPolicyRemoval,
    reviewPolicyRemoval,
    getPendingPolicyRemovals,
    getPinnedDocuments,
    pinDocument,
    unpinDocument,
    getDocumentPinStatus,
    extractAndFormatPolicyWithAI,
};
