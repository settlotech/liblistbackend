const taskService = require('../services/task.service');
const AppError = require('../utils/appError');

 
const ok = (res, data, message = 'Success', status = 200) =>
    res.status(status).json({ success: true, message, data });

 
const createTask = async (req, res, next) => {
    try {
        const task = await taskService.createTask(req.body, req.user);
        return ok(res, task, 'Task created successfully', 201);
    } catch (err) {
        next(err);
    }
};

 
const getTasks = async (req, res, next) => {
    try {
        const { search = '', page = 1, limit = 20 } = req.query;
        const result = await taskService.getTasks({
            userId: req.user.id,
            search,
            page: parseInt(page, 10),
            limit: Math.min(parseInt(limit, 10), 100)
        });
        return ok(res, result, 'Tasks retrieved successfully');
    } catch (err) {
        next(err);
    }
};

 
const getCommonTasks = async (req, res, next) => {
    try {
        const { search = '', page = 1, limit = 20 } = req.query;
        const tasks = await taskService.getCommonTasks({
            userId: req.user.id,
            search,
            page: parseInt(page, 10),
            limit: parseInt(limit, 10)
        });
        return ok(res, tasks, 'Common tasks retrieved');
    } catch (err) {
        next(err);
    }
};

 
const getPinnedTasks = async (req, res, next) => {
    try {
        const { search = '', page = 1, limit = 20 } = req.query;
        const tasks = await taskService.getPinnedTasks({
            userId: req.user.id,
            search,
            page: parseInt(page, 10),
            limit: parseInt(limit, 10)
        });
        return ok(res, tasks, 'Pinned tasks retrieved');
    } catch (err) {
        next(err);
    }
};

 
const getGeneralTasks = async (req, res, next) => {
    try {
        const { search = '', page = 1, limit = 20 } = req.query;
        const tasks = await taskService.getGeneralTasks({
            userId: req.user.id,
            search,
            page: parseInt(page, 10),
            limit: parseInt(limit, 10)
        });
        return ok(res, tasks, 'General tasks retrieved');
    } catch (err) {
        next(err);
    }
};

 
const getTaskById = async (req, res, next) => {
    try {
        const task = await taskService.getTaskById(req.params.id, req.user.id, req.user.isSuperAdmin);
        return ok(res, task, 'Task retrieved');
    } catch (err) {
        next(err);
    }
};

 
const updateTask = async (req, res, next) => {
    try {
        const task = await taskService.updateTask(req.params.id, req.body, req.user);
        return ok(res, task, 'Task updated successfully');
    } catch (err) {
        next(err);
    }
};

 
const deleteTask = async (req, res, next) => {
    try {
        await taskService.deleteTask(req.params.id, req.user);
        return ok(res, null, 'Task deleted successfully');
    } catch (err) {
        next(err);
    }
};

 
const assignTask = async (req, res, next) => {
    try {
        const { assigned_to } = req.body;
        const task = await taskService.assignTask(req.params.id, assigned_to, req.user);
        return ok(res, task, 'Task assigned successfully');
    } catch (err) {
        next(err);
    }
};
 
const reassignTask = async (req, res, next) => {
    try {
        const { assigned_to } = req.body;
        const task = await taskService.reassignTask(req.params.id, assigned_to, req.user);
        return ok(res, task, 'Task reassigned successfully');
    } catch (err) {
        next(err);
    }
};

 
const updateTaskStatus = async (req, res, next) => {
    try {
        const { status, comment } = req.body;
        const task = await taskService.updateTaskStatus(req.params.id, status, req.user, comment);
        return ok(res, task, `Task status updated to ${status}`);
    } catch (err) {
        next(err);
    }
};

 
const approveTask = async (req, res, next) => {
    try {
        const { comment } = req.body || {};
        const task = await taskService.approveTask(req.params.id, req.user, comment);
        return ok(res, task, 'Task approved successfully');
    } catch (err) {
        next(err);
    }
};

 
const cancelTask = async (req, res, next) => {
    try {
        const { comment } = req.body || {};
        const task = await taskService.cancelTask(req.params.id, req.user, comment);
        return ok(res, task, 'Task cancelled successfully');
    } catch (err) {
        next(err);
    }
};


 
const getParticipants = async (req, res, next) => {
    try {
        const participants = await taskService.getParticipants(
            req.params.id, req.user.id, req.user.isSuperAdmin
        );
        return ok(res, participants, 'Participants retrieved');
    } catch (err) {
        next(err);
    }
};


const addParticipant = async (req, res, next) => {
    try {
        const participant = await taskService.addParticipant(req.params.id, req.body, req.user);
        return ok(res, participant, 'Participant added', 201);
    } catch (err) {
        next(err);
    }
};


const removeParticipant = async (req, res, next) => {
    try {
        await taskService.removeParticipant(req.params.id, req.params.participantId, req.user);
        return ok(res, null, 'Participant removed');
    } catch (err) {
        next(err);
    }
};


const pinTask = async (req, res, next) => {
    try {
        await taskService.pinTask(req.params.id, req.user.id);
        return ok(res, null, 'Task pinned');
    } catch (err) {
        next(err);
    }
};


const unpinTask = async (req, res, next) => {
    try {
        await taskService.unpinTask(req.params.id, req.user.id);
        return ok(res, null, 'Task unpinned');
    } catch (err) {
        next(err);
    }
};


const getTaskLogs = async (req, res, next) => {
    try {
        const logs = await taskService.getTaskLogs(req.params.id, req.user.id, req.user.isSuperAdmin);
        return ok(res, logs, 'Task logs retrieved');
    } catch (err) {
        next(err);
    }
};


const addComment = async (req, res, next) => {
    try {
        const { comment } = req.body;
        const log = await taskService.addComment(req.params.id, comment, req.user);
        return ok(res, log, 'Comment added', 201);
    } catch (err) {
        next(err);
    }
};

/**
 * GET /api/tasks/users
 * Returns active users from users table for task assignment and participant selection.
 */
const getAssignableUsers = async (req, res, next) => {
    try {
        const users = await taskService.getAssignableUsers();
        return ok(res, users, 'Assignable users retrieved successfully');
    } catch (err) {
        next(err);
    }
};

module.exports = {
    getAssignableUsers,
    createTask,
    getTasks,
    getTaskById,
    updateTask,
    deleteTask,

    getCommonTasks,
    getPinnedTasks,
    getGeneralTasks,

    assignTask,
    reassignTask,

    updateTaskStatus,

    approveTask,
    cancelTask,

    getParticipants,
    addParticipant,
    removeParticipant,

    pinTask,
    unpinTask,
    
    getTaskLogs,
    addComment
};
