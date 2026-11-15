const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/appError');
const { sendSuccess } = require('../utils/response');
const templateModel = require('../models/template.model');
const documentModel = require('../models/document.model');
const rbacModel = require('../models/rbac.model');
const { sendNotificationToMany, sendNotificationToSingle } = require('../services/notification.service');

/* ─── Helper: is user Super Admin or Admin ─────────────────── */
const isAdminUser = (user) =>
    user?.isSuperAdmin ||
    (user?.roles || []).some(r => {
        const name = typeof r === 'string' ? r : r.role_name;
        return name?.toLowerCase() === 'super admin' || name?.toLowerCase() === 'admin';
    });

/* ─── Notify all users with templates:approval permission ─── */
const notifyApprovers = async ({ templateName, submitterName, templateId }) => {
    try {
        const approverIds = await rbacModel.getUsersWithPermission('templates', 'approval');
        if (!approverIds.length) return;

        await sendNotificationToMany({
            userIds: approverIds,
            title: 'Template Awaiting Approval',
            body: `${submitterName || 'A user'} submitted "${templateName}" for approval.`,
            data: {
                type: 'template_approval_request',
                template_id: templateId,
                clickAction: '/templates',
            },
            clickAction: '/templates',
        });

        console.log(`Approval notification sent to ${approverIds.length} approver(s) for template "${templateName}"`);
    } catch (err) {
        // Non-fatal — template is already created
        console.error('Failed to send approver notifications:', err.message);
    }
};

/* ─── Notify submitter on decision ─────────────────────────── */
const notifySubmitter = async ({ userId, templateName, action, rejectionReason }) => {
    if (!userId) return;
    try {
        const isApproved = action === 'approve';
        await sendNotificationToSingle({
            userId,
            title: isApproved ? 'Template Approved' : 'Template Rejected',
            body: isApproved
                ? `Your template "${templateName}" has been approved and is now live.`
                : `Your template "${templateName}" was rejected. ${rejectionReason ? 'Reason: ' + rejectionReason : ''}`,
            data: {
                type: isApproved ? 'template_approved' : 'template_rejected',
                clickAction: '/templates',
            },
            clickAction: '/templates',
        });
    } catch (err) {
        console.error('[Template] Failed to send submitter notification:', err.message);
    }
};

 
const getCategories = asyncHandler(async (req, res) => {
    const { search = '' } = req.query;
    const categories = await templateModel.findCategories(search);
    return sendSuccess(res, 'Categories retrieved', categories);
});

/* ═══════════════════════════════════════════════════════════
   POST /api/document-management/templates
   - Super Admin / Admin → instantly approved
   - Others (with templates:create) → pending + notify approvers
══════════════════════════════════════════════════════════════ */
const createTemplate = asyncHandler(async (req, res) => {
    const user = req.user;
    const isAdmin = isAdminUser(user);
    const { template_name, description, category, structure } = req.body;

    const defaultSections = [
        { title: '1. Configuration', order: 0, content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Document configuration, ownership, scope and classification.' }] }] } },
        { title: '2. Summary',       order: 1, content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Executive policy summary and objectives.' }] }] } },
        { title: '3. Details',       order: 2, content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Operational policy clauses and core requirements.' }] }] } },
        { title: '4. Reference',     order: 3, content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Statutory citations and internal bank policies.' }] }] } },
        { title: '5. Dependencies',  order: 4, content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cross-departmental dependencies and governance.' }] }] } },
        { title: '6. Controls',      order: 5, content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Risk mitigation measures, SLAs and verification checkpoints.' }] }] } },
    ];

    const finalStructure = structure?.sections?.length > 0 ? structure : { sections: defaultSections };
    const initialStatus  = isAdmin ? 'approved' : 'pending';

    const template = await templateModel.create({
        template_name,
        template_id:  `TMPL-${Date.now().toString().slice(-6)}`,
        description,
        category:     category || 'General',
        structure:    finalStructure,
        status:       initialStatus,
        created_by:   user?.id,
        requested_by: isAdmin ? null  : user?.id,
        approved_by:  isAdmin ? user?.id : null,
        approved_at:  isAdmin ? new Date() : null,
    });

    // If pending, notify all users with templates:approval permission, and confirm to submitter
    if (initialStatus === 'pending') {
        setImmediate(() => {
            notifyApprovers({
                templateName:  template_name,
                submitterName: user?.name || user?.email,
                templateId:    template.id,
            });

            if (user?.id) {
                sendNotificationToSingle({
                    userId: user.id,
                    title: '📋 Template Submitted for Review',
                    body: `Your template "${template_name}" has been submitted for review. Approvers have been notified.`,
                    data: {
                        type: 'template_submitted_for_review',
                        clickAction: '/templates',
                    },
                    clickAction: '/templates',
                }).catch(err => console.error('[Template] Failed to notify submitter:', err.message));
            }
        });
    }

    const msg = isAdmin
        ? 'Template created and approved successfully.'
        : 'Template submitted for review. Approvers have been notified.';

    return sendSuccess(res, msg, template, 201);
});

/* ═══════════════════════════════════════════════════════════
   GET /api/document-management/templates
   - Admins/approvers: see all (or filter by status)
   - Others: approved only
══════════════════════════════════════════════════════════════ */
const getAllTemplates = asyncHandler(async (req, res) => {
    const user = req.user;
    const canSeeAll = isAdminUser(user) ||
        (user?.permissionStrings || []).includes('templates:approval');

    const { category, search, page = 1, limit = 50 } = req.query;
    const status = canSeeAll ? (req.query.status || undefined) : 'approved';
    const offset = (page - 1) * limit;

    const { templates, total } = await templateModel.findAll({ category, status, search, limit, offset });

    return sendSuccess(res, 'Templates retrieved successfully', templates, 200, {
        total,
        page: Number(page),
        limit: Number(limit),
    });
});

/* ═══════════════════════════════════════════════════════════
   GET /api/document-management/templates/:id
══════════════════════════════════════════════════════════════ */
const getTemplateById = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const template = await templateModel.findById(id);
    if (!template) throw new AppError('Template not found.', 404);
    return sendSuccess(res, 'Template retrieved successfully', template);
});

/* ═══════════════════════════════════════════════════════════
   PUT /api/document-management/templates/:id
   Update an existing template (requires templates:update permission)
══════════════════════════════════════════════════════════════ */
const updateTemplate = asyncHandler(async (req, res) => {
    const user = req.user;
    const { id } = req.params;
    const { template_name, category, description, structure } = req.body;

    const existing = await templateModel.findById(id);
    if (!existing) {
        throw new AppError('Template not found.', 404);
    }

    const updated = await templateModel.update(id, {
        template_name: template_name ? template_name.trim() : undefined,
        category: category ? category.trim() : undefined,
        description: description !== undefined ? description.trim() : undefined,
        structure,
        updated_by: user?.id,
    });

    return sendSuccess(res, 'Template updated successfully', updated);
});

/* ═══════════════════════════════════════════════════════════
   PATCH /api/document-management/templates/:id/approval
   Requires templates:approval permission
   Notifies the submitter of the decision
══════════════════════════════════════════════════════════════ */
const reviewTemplate = asyncHandler(async (req, res) => {
    const user = req.user;
    const { id } = req.params;
    const { action, rejection_reason } = req.body; // 'approve' | 'reject'

    if (!['approve', 'reject'].includes(action)) {
        throw new AppError('Invalid action. Must be "approve" or "reject".', 400);
    }

    const template = await templateModel.findById(id);
    if (!template) throw new AppError('Template not found.', 404);

    if (template.status !== 'pending') {
        throw new AppError(`Template is already "${template.status}". Only pending templates can be reviewed.`, 400);
    }

    const updated = await templateModel.updateStatus(id, {
        status:           action === 'approve' ? 'approved' : 'rejected',
        approved_by:      user.id,
        rejection_reason: action === 'reject' ? rejection_reason : null,
    });

    // Notify the submitter (non-blocking)
    if (template.requested_by) {
        setImmediate(() =>
            notifySubmitter({
                userId:          template.requested_by,
                templateName:    template.template_name,
                action,
                rejectionReason: rejection_reason,
            })
        );
    }

    return sendSuccess(res, `Template ${action}d successfully.`, updated);
});

/* ═══════════════════════════════════════════════════════════
   POST /api/document-management/templates/:id/clone
══════════════════════════════════════════════════════════════ */
const cloneTemplateToDocument = asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    const { id } = req.params;
    const { library_id, document_name, description } = req.body;

    const template = await templateModel.findById(id);
    if (!template) throw new AppError('Template not found.', 404);

    if (template.status !== 'approved') {
        throw new AppError('Cannot instantiate an unapproved template.', 400);
    }

    const sections = template.structure?.sections || [];

    const document = await documentModel.create({
        library_id,
        document_name: document_name || template.template_name,
        description:   description || template.description,
        document_type: 'policy',
        source_type:   'template',
        created_by:    userId,
        updated_by:    userId,
    });

    return sendSuccess(res, 'Policy cloned from template successfully', {
        document,
        sectionsCount: sections.length,
    }, 201);
});

/* ═══════════════════════════════════════════════════════════
   DELETE /api/document-management/templates/:id
══════════════════════════════════════════════════════════════ */
const deleteTemplate = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const deleted = await templateModel.softDelete(id);
    if (!deleted) throw new AppError('Template not found.', 404);
    return sendSuccess(res, 'Template deleted successfully', { id });
});

module.exports = {
    getCategories,
    createTemplate,
    getAllTemplates,
    getTemplateById,
    updateTemplate,
    reviewTemplate,
    cloneTemplateToDocument,
    deleteTemplate,
};
