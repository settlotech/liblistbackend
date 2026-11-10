const taskModel = require('../models/task.model');
const AppError = require('../utils/appError');
const notificationService = require('./notification.service');
 
const sendParticipantNotification = async (userId, role, task, assignerName) => {
    if (!userId) return;
    const taskCode = task.task_code || 'Task';
    const taskTitle = task.title || 'Untitled Task';

    let title = '';
    let body = '';

    switch (role) {
        case 'assignee':
            title = `Task Assigned: ${taskCode} - ${taskTitle}`;
            body = assignerName
                ? `${assignerName} assigned task "${taskTitle}" (${taskCode}) to you. Responsibility: Primary Assignee - Complete and submit deliverables.`
                : `You have been assigned to task "${taskTitle}" (${taskCode}). Responsibility: Primary Assignee - Complete and submit deliverables.`;
            break;
        case 'approver':
            title = `Task Assignment: Approver [${taskCode}]`;
            body = assignerName
                ? `${assignerName} designated you as an Approver for task "${taskTitle}" (${taskCode}). Responsibility: Review and provide final sign-off upon completion.`
                : `You have been designated as an Approver for task "${taskTitle}" (${taskCode}). Responsibility: Review and provide final sign-off upon completion.`;
            break;
        case 'reviewer':
            title = `Task Assignment: Reviewer [${taskCode}]`;
            body = assignerName
                ? `${assignerName} designated you as a Reviewer for task "${taskTitle}" (${taskCode}). Responsibility: Review task details, monitor progress, and provide feedback.`
                : `You have been designated as a Reviewer for task "${taskTitle}" (${taskCode}). Responsibility: Review task details, monitor progress, and provide feedback.`;
            break;
        case 'for_info':
            title = `Task Assignment: For Info [${taskCode}]`;
            body = assignerName
                ? `${assignerName} included you for information on task "${taskTitle}" (${taskCode}). Responsibility: Keep informed of task progress and updates.`
                : `You have been included for information on task "${taskTitle}" (${taskCode}). Responsibility: Keep informed of task progress and updates.`;
            break;
        default:
            title = `Task Update: [${taskCode}]`;
            body = `You have a new update regarding task "${taskTitle}" (${taskCode}).`;
    }

    try {
        await notificationService.sendNotificationToSingle({
            userId,
            title,
            body,
            data: {
                taskId: task.id,
                taskCode,
                role,
                type: 'task_assignment'
            },
            clickAction: '/demotask'
        });
    } catch (err) {
        console.error(`[TaskNotification] Failed to send notification to ${userId} (${role}):`, err.message);
    }
};

const getAssignableUsers = async () => {
    return await taskModel.getAssignableUsers();
};

const createTask = async (taskData, createdByUser) => {
    taskData.created_by = createdByUser.id;
    const task = await taskModel.createTask(taskData);

    // Send notifications to Assignee and initial participants according to their responsibility
    (async () => {
        try {
            const taskDetails = (await taskModel.getTaskById(task.id, createdByUser.id)) || task;

            // 1. Notify Assignee if assigned at creation
            if (task.assigned_to) {
                await sendParticipantNotification(task.assigned_to, 'assignee', taskDetails, createdByUser.name);
            }

            // 2. Notify initial participants according to their role
            if (Array.isArray(taskData.participants)) {
                for (const p of taskData.participants) {
                    if (p.user_id) {
                        await sendParticipantNotification(p.user_id, p.role, taskDetails, createdByUser.name);
                    }
                }
            }
        } catch (notifErr) {
            console.error('[TaskNotification] Error sending creation notifications:', notifErr.message);
        }
    })();

    return task;
};

const getTasks = async ({ userId, search, page, limit }) => {
    return await taskModel.getTasksForUser({ userId, search, page, limit });
};

const getCommonTasks = async ({ userId, search, page, limit }) => {
    return await taskModel.getCommonTasks({ userId, search, page, limit });
};

const getPinnedTasks = async ({ userId, search, page, limit }) => {
    return await taskModel.getPinnedTasks({ userId, search, page, limit });
};

const getGeneralTasks = async ({ userId, search, page, limit }) => {
    return await taskModel.getGeneralTasks({ userId, search, page, limit });
};

const getTaskById = async (taskId, userId) => {
    const task = await taskModel.getTaskById(taskId, userId);
    if (!task) throw new AppError('Task not found', 404);

    const [participants, logs] = await Promise.all([
        taskModel.getParticipants(taskId),
        taskModel.getTaskLogs(taskId)
    ]);

    return { ...task, participants, logs };
};

const updateTask = async (taskId, updates, user) => {
    const task = await taskModel.getTaskById(taskId, user.id);
    if (!task) throw new AppError('Task not found', 404);
    return await taskModel.updateTask(taskId, updates, user.id);
};

const deleteTask = async (taskId, user) => {
    const task = await taskModel.getTaskById(taskId, user.id);
    if (!task) throw new AppError('Task not found', 404);
    return await taskModel.deleteTask(taskId, user.id);
};

const assignTask = async (taskId, assignedTo, user) => {
    const task = await taskModel.getTaskById(taskId, user.id);
    if (!task) throw new AppError('Task not found', 404);
    const result = await taskModel.assignTask(taskId, assignedTo, user.id);

    // Send notifications to Assignee and all existing participants according to responsibility
    (async () => {
        try {
            const taskDetails = (await taskModel.getTaskById(taskId, user.id)) || task;
            const participants = await taskModel.getParticipants(taskId);

            // 1. Notify Assignee
            if (assignedTo) {
                await sendParticipantNotification(assignedTo, 'assignee', taskDetails, user.name);
            }

            // 2. Notify all participants (Approver, Reviewer, For Info)
            for (const p of participants) {
                if (p.user_id !== assignedTo) {
                    await sendParticipantNotification(p.user_id, p.role, taskDetails, user.name);
                }
            }
        } catch (notifErr) {
            console.error('[TaskNotification] Error sending assignment notifications:', notifErr.message);
        }
    })();

    return result;
};

const reassignTask = async (taskId, newAssignedTo, user) => {
    const task = await taskModel.getTaskById(taskId, user.id);
    if (!task) throw new AppError('Task not found', 404);
    const result = await taskModel.reassignTask(taskId, newAssignedTo, user.id);

    // Send notifications to new Assignee and existing participants
    (async () => {
        try {
            const taskDetails = (await taskModel.getTaskById(taskId, user.id)) || task;
            const participants = await taskModel.getParticipants(taskId);

            // 1. Notify new Assignee
            if (newAssignedTo) {
                await sendParticipantNotification(newAssignedTo, 'assignee', taskDetails, user.name);
            }

            // 2. Notify all participants (Approver, Reviewer, For Info)
            for (const p of participants) {
                if (p.user_id !== newAssignedTo) {
                    await sendParticipantNotification(p.user_id, p.role, taskDetails, user.name);
                }
            }
        } catch (notifErr) {
            console.error('[TaskNotification] Error sending reassignment notifications:', notifErr.message);
        }
    })();

    return result;
};

const updateTaskStatus = async (taskId, newStatus, user, comment = null) => {
    const task = await taskModel.getTaskById(taskId, user.id);
    if (!task) throw new AppError('Task not found', 404);

    const result = await taskModel.updateTaskStatus(taskId, newStatus, user.id, comment);
    if (result.error) throw new AppError(result.error, result.status);
    return result.task;
};

const approveTask = async (taskId, user, comment = null) => {
    return await updateTaskStatus(taskId, 'approved', user, comment);
};

const cancelTask = async (taskId, user, comment = null) => {
    return await updateTaskStatus(taskId, 'cancelled', user, comment);
};

const getParticipants = async (taskId) => {
    return await taskModel.getParticipants(taskId);
};

const addParticipant = async (taskId, participantData, user) => {
    const task = await taskModel.getTaskById(taskId, user.id);
    if (!task) throw new AppError('Task not found', 404);
    const added = await taskModel.addParticipant(taskId, participantData.user_id, participantData.role, user.id);

    // Send notification to newly added participant according to role
    if (added && participantData.user_id) {
        (async () => {
            try {
                await sendParticipantNotification(participantData.user_id, participantData.role, task, user.name);
            } catch (notifErr) {
                console.error('[TaskNotification] Error sending participant notification:', notifErr.message);
            }
        })();
    }

    return added;
};

const removeParticipant = async (taskId, participantId, user) => {
    const task = await taskModel.getTaskById(taskId, user.id);
    if (!task) throw new AppError('Task not found', 404);
    return await taskModel.removeParticipant(taskId, participantId, user.id);
};

const pinTask = async (taskId, userId) => {
    return await taskModel.pinTask(taskId, userId);
};

const unpinTask = async (taskId, userId) => {
    return await taskModel.unpinTask(taskId, userId);
};

const getTaskLogs = async (taskId) => {
    return await taskModel.getTaskLogs(taskId);
};

const addComment = async (taskId, comment, user) => {
    return await taskModel.addComment(taskId, comment, user.id);
};

module.exports = {
    getAssignableUsers,
    createTask,
    getTasks,
    getCommonTasks,
    getPinnedTasks,
    getGeneralTasks,
    getTaskById,
    updateTask,
    deleteTask,
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
