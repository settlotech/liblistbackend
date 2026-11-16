const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/appError');
const { sendSuccess } = require('../utils/response');
const userNoteModel = require('../models/userNote.model');

const resolveUserId = (req) => {
    return String(
        req.user?.id ||
        req.user?.email ||
        req.headers['x-user-id'] ||
        'u_cba_marcus'
    );
};

const listNotes = asyncHandler(async (req, res) => {
    const userId = resolveUserId(req);
    const { itemType, policyId } = req.query;
    const items = await userNoteModel.listByUser(userId, { itemType, policyId });
    return sendSuccess(res, 'User notes and annotations retrieved successfully', items);
});

const createNote = asyncHandler(async (req, res) => {
    const userId = resolveUserId(req);
    const created = await userNoteModel.createForUser(userId, req.body || {});
    return sendSuccess(res, 'Saved to Notes & Annotations', created, 201);
});

const updateNote = asyncHandler(async (req, res) => {
    const userId = resolveUserId(req);
    const { id } = req.params;
    const updated = await userNoteModel.updateForUser(userId, id, req.body || {});
    if (!updated) {
        throw new AppError('Note or annotation not found.', 404);
    }
    return sendSuccess(res, 'Updated successfully', updated);
});

const removeNote = asyncHandler(async (req, res) => {
    const userId = resolveUserId(req);
    const { id } = req.params;
    const deleted = await userNoteModel.deleteForUser(userId, id);
    if (!deleted) {
        throw new AppError('Note or annotation not found.', 404);
    }
    return sendSuccess(res, 'Deleted successfully', { id });
});

module.exports = {
    listNotes,
    createNote,
    updateNote,
    removeNote,
};
