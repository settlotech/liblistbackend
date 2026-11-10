const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/appError');
const { sendSuccess } = require('../utils/response');
const { withTransaction } = require('../config/db');
const templateModel = require('../models/template.model');
const documentModel = require('../models/document.model');
const sectionModel = require('../models/section.model');
const libraryModel = require('../models/library.model');

const createTemplate = asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    const { template_name, description, category, structure } = req.body;

    const template = await templateModel.create({
        template_name,
        description,
        category,
        structure,
        created_by: userId,
    });

    return sendSuccess(res, 'Template created successfully', template, 201);
});

const getTemplateById = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const template = await templateModel.findById(id);

    if (!template) {
        throw new AppError('Template not found.', 404);
    }

    return sendSuccess(res, 'Template retrieved successfully', template);
});

const getAllTemplates = asyncHandler(async (req, res) => {
    const { category, search, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    const { templates, total } = await templateModel.findAll({
        category,
        search,
        limit: Number(limit),
        offset,
    });

    return sendSuccess(res, 'Templates retrieved successfully', templates, 200, {
        page: Number(page),
        limit: Number(limit),
        total,
    });
});

const updateTemplate = asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    const { id } = req.params;

    const existing = await templateModel.findById(id);
    if (!existing) {
        throw new AppError('Template not found.', 404);
    }

    const updated = await templateModel.update(id, req.body, userId);
    return sendSuccess(res, 'Template updated successfully', updated);
});

const deleteTemplate = asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    const { id } = req.params;

    const existing = await templateModel.findById(id);
    if (!existing) {
        throw new AppError('Template not found.', 404);
    }

    const deleted = await templateModel.softDelete(id, userId);
    return sendSuccess(res, 'Template deleted successfully', deleted);
});

const createDocumentFromTemplate = asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    const { id: templateId } = req.params;
    const { library_id, document_name, description } = req.body;

    const template = await templateModel.findById(templateId);
    if (!template) {
        throw new AppError('Template not found.', 404);
    }

    const library = await libraryModel.findById(library_id);
    if (!library) {
        throw new AppError('Target library not found.', 404);
    }

    const result = await withTransaction(async (client) => {
        const document = await documentModel.create({
            library_id,
            document_name,
            description: description || template.description,
            document_type: template.category || 'template_instance',
            source_type: 'template',
            created_by: userId,
            updated_by: userId,
        });

        const templateSections = template.structure?.sections || [];
        const createdSections = [];

        const recursivelyCreateSections = async (sections, parentSectionId = null) => {
            for (let i = 0; i < sections.length; i++) {
                const sec = sections[i];
                const created = await sectionModel.create(
                    {
                        document_id: document.id,
                        parent_section_id: parentSectionId,
                        section_title: sec.title,
                        section_number: sec.section_number || null,
                        section_order: sec.order ?? i,
                        content: sec.content || { type: 'doc', content: [] },
                        created_by: userId,
                        updated_by: userId,
                    },
                    client
                );
                createdSections.push(created);

                if (Array.isArray(sec.subsections) && sec.subsections.length > 0) {
                    await recursivelyCreateSections(sec.subsections, created.id);
                }
            }
        };

        await recursivelyCreateSections(templateSections);

        return {
            document,
            sections_created_count: createdSections.length,
            sections: createdSections,
        };
    });

    return sendSuccess(
        res,
        `Document '${document_name}' created successfully from template '${template.template_name}'`,
        result,
        201
    );
});

module.exports = {
    createTemplate,
    getTemplateById,
    getAllTemplates,
    updateTemplate,
    deleteTemplate,
    createDocumentFromTemplate,
};
