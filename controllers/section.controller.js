const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/appError');
const { sendSuccess } = require('../utils/response');
const sectionModel = require('../models/section.model');
const documentModel = require('../models/document.model');
const activityModel = require('../models/activity.model');

const createSection = asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    const {
        document_id,
        parent_section_id,
        section_title,
        section_number,
        section_order = 0,
        content,
        page_start,
        page_end,
    } = req.body;

    const document = await documentModel.findById(document_id);
    if (!document) {
        throw new AppError('Specified document does not exist.', 404);
    }

    if (parent_section_id) {
        const parentSection = await sectionModel.findById(parent_section_id);
        if (!parentSection) {
            throw new AppError('Specified parent section does not exist.', 404);
        }
        if (parentSection.document_id !== document_id) {
            throw new AppError('Parent section belongs to a different document.', 400);
        }
    }

    const section = await sectionModel.create({
        document_id,
        parent_section_id: parent_section_id || null,
        section_title,
        section_number,
        section_order,
        content,
        page_start,
        page_end,
        created_by: userId,
        updated_by: userId,
    });

    await activityModel.logActivity({
        document_id,
        library_id: document.library_id,
        activity_type: 'SECTION_CREATED',
        entity_type: 'section',
        entity_id: section.id,
        description: `Section '${section.section_title}' was created.`,
        actor_id: userId,
    });

    return sendSuccess(res, 'Section created successfully', section, 201);
});

const createSubSection = asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    const {
        parent_section_id,
        section_title,
        section_number,
        section_order = 0,
        content,
        page_start,
        page_end,
    } = req.body;

    const parentSection = await sectionModel.findById(parent_section_id);
    if (!parentSection) {
        throw new AppError('Parent section not found.', 404);
    }

    const subSection = await sectionModel.create({
        document_id: parentSection.document_id,
        parent_section_id,
        section_title,
        section_number,
        section_order,
        content,
        page_start,
        page_end,
        created_by: userId,
        updated_by: userId,
    });

    return sendSuccess(res, 'Subsection created successfully', subSection, 201);
});

const getAllSectionsOfDocument = asyncHandler(async (req, res) => {
    const { documentId } = req.params;
    const { include_content, parent_section_id } = req.query;

    const document = await documentModel.findById(documentId);
    if (!document) {
        throw new AppError('Document not found.', 404);
    }

    const sections = await sectionModel.findByDocumentId(documentId, {
        include_content,
        parent_section_id,
    });

    return sendSuccess(res, 'Document sections retrieved successfully', sections);
});

const getSectionById = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const section = await sectionModel.findById(id);

    if (!section) {
        throw new AppError('Section not found.', 404);
    }

    return sendSuccess(res, 'Section retrieved successfully', section);
});

const updateSection = asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    const { id } = req.params;
    const { lock_version, ...data } = req.body;

    const updated = await sectionModel.updateMetadata(
        id,
        data,
        lock_version,
        userId
    );

    return sendSuccess(res, 'Section updated successfully', updated);
});

const updateSectionContent = asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    const { id } = req.params;
    const { content, lock_version } = req.body;

    const updated = await sectionModel.updateContent(
        id,
        content,
        lock_version,
        userId
    );

    await activityModel.logActivity({
        document_id: updated.document_id,
        activity_type: 'SECTION_CONTENT_UPDATED',
        entity_type: 'section',
        entity_id: id,
        description: `Content updated for section '${updated.section_title}'.`,
        metadata: { new_lock_version: updated.lock_version },
        actor_id: userId,
    });

    return sendSuccess(res, 'Section content updated successfully', updated);
});

const saveSectionDraft = asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    const { id } = req.params;
    const { content, lock_version } = req.body;

    const updated = await sectionModel.updateContent(
        id,
        content,
        lock_version,
        userId
    );

    await activityModel.logActivity({
        document_id: updated.document_id,
        activity_type: 'SECTION_DRAFT_SAVED',
        entity_type: 'section',
        entity_id: id,
        description: `Draft saved for section '${updated.section_title}'.`,
        actor_id: userId,
    });

    return sendSuccess(res, 'Draft saved successfully', updated);
});

const moveSection = asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    const { id } = req.params;
    const { target_parent_section_id, section_order, lock_version } = req.body;

    const section = await sectionModel.findById(id);
    if (!section) {
        throw new AppError('Section not found.', 404);
    }

    if (target_parent_section_id) {
        if (target_parent_section_id === id) {
            throw new AppError('A section cannot be moved under itself.', 400);
        }

        const targetParent = await sectionModel.findById(target_parent_section_id);
        if (!targetParent) {
            throw new AppError('Target parent section not found.', 404);
        }

        if (targetParent.document_id !== section.document_id) {
            throw new AppError('Cannot move section into a different document.', 400);
        }

        const wouldCauseCycle = await sectionModel.isDescendant(id, target_parent_section_id);
        if (wouldCauseCycle) {
            throw new AppError('Cannot move section into one of its own subsections (cycle detected).', 400);
        }
    }

    const moved = await sectionModel.move(
        id,
        target_parent_section_id,
        section_order ?? section.section_order,
        lock_version,
        userId
    );

    await activityModel.logActivity({
        document_id: section.document_id,
        activity_type: 'SECTION_MOVED',
        entity_type: 'section',
        entity_id: id,
        description: `Section '${moved.section_title}' was moved.`,
        metadata: { target_parent_section_id },
        actor_id: userId,
    });

    return sendSuccess(res, 'Section moved successfully', moved);
});

const reorderSections = asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    const { document_id, items } = req.body;

    const document = await documentModel.findById(document_id);
    if (!document) {
        throw new AppError('Document not found.', 404);
    }

    const updatedSections = await sectionModel.reorderBatch(document_id, items, userId);

    await activityModel.logActivity({
        document_id,
        activity_type: 'SECTIONS_REORDERED',
        entity_type: 'document',
        entity_id: document_id,
        description: `Sections reordered for document '${document.document_name}'.`,
        metadata: { updated_count: updatedSections.length },
        actor_id: userId,
    });

    return sendSuccess(res, 'Sections reordered successfully', updatedSections);
});

const getSectionHierarchy = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const section = await sectionModel.findById(id);
    if (!section) {
        throw new AppError('Section not found.', 404);
    }

    const tree = await sectionModel.getHierarchy(id);
    return sendSuccess(res, 'Section hierarchy retrieved successfully', tree);
});

const deleteSection = asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    const { id } = req.params;

    const section = await sectionModel.findById(id);
    if (!section) {
        throw new AppError('Section not found.', 404);
    }

    const deletedSections = await sectionModel.softDeleteRecursive(id, userId);

    await activityModel.logActivity({
        document_id: section.document_id,
        activity_type: 'SECTION_DELETED',
        entity_type: 'section',
        entity_id: id,
        description: `Section '${section.section_title}' and ${deletedSections.length - 1} subsections were deleted.`,
        actor_id: userId,
    });

    return sendSuccess(res, 'Section and subsections deleted successfully', {
        deleted_count: deletedSections.length,
        deleted_sections: deletedSections,
    });
});

module.exports = {
    createSection,
    createSubSection,
    getAllSectionsOfDocument,
    getSectionById,
    updateSection,
    updateSectionContent,
    saveSectionDraft,
    moveSection,
    reorderSections,
    getSectionHierarchy,
    deleteSection,
};
