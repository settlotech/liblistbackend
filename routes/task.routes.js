const { Router } = require('express');
const taskController = require('../controllers/task.controller');
const authenticate = require('../middleware/auth.middleware');
const {
    validate,
    createTaskSchema,
    updateTaskSchema,
    assignTaskSchema,
    statusUpdateSchema,
    addParticipantSchema,
    addCommentSchema,
    createGroupSchema
} = require('../validators/task.validator');

const router = Router();

// ── STATIC / COLLECTION ROUTES ──────────────────────────────────────────
router.get('/users', authenticate, taskController.getAssignableUsers);
router.get('/groups', authenticate, taskController.getAssigneeGroups);
router.post('/groups', authenticate, validate(createGroupSchema), taskController.createAssigneeGroup);
router.delete('/groups/:groupId', authenticate, taskController.deleteAssigneeGroup);
router.get('/common', authenticate, taskController.getCommonTasks);
router.get('/pinned', authenticate, taskController.getPinnedTasks);
router.get('/general', authenticate, taskController.getGeneralTasks);
router.get('/', authenticate, taskController.getTasks);
router.post('/', authenticate, validate(createTaskSchema), taskController.createTask);

// ── PARAMETERIZED ROUTES ────────────────────────────────────────────────
router.get('/:id', authenticate, taskController.getTaskById);
router.put('/:id', authenticate, validate(updateTaskSchema), taskController.updateTask);
router.delete('/:id', authenticate, taskController.deleteTask);

// Assignment & Reassignment
router.put('/:id/assign', authenticate, validate(assignTaskSchema), taskController.assignTask);
router.put('/:id/reassign', authenticate, validate(assignTaskSchema), taskController.reassignTask);

// Status & Lifecycle (Approved, Cancelled, Completed, Responded)
router.put('/:id/status', authenticate, validate(statusUpdateSchema), taskController.updateStatus);
router.put('/:id/approve', authenticate, taskController.approveTask);
router.put('/:id/cancel', authenticate, taskController.cancelTask);

// Pins
router.post('/:id/pin', authenticate, taskController.pinTask);
router.delete('/:id/pin', authenticate, taskController.unpinTask);

// Logs & Comments
router.get('/:id/logs', authenticate, taskController.getTaskLogs);
router.post('/:id/comments', authenticate, validate(addCommentSchema), taskController.addComment);

// Participants
router.get('/:id/participants', authenticate, taskController.getParticipants);
router.post('/:id/participants', authenticate, validate(addParticipantSchema), taskController.addParticipant);
router.delete('/:id/participants/:participantId', authenticate, taskController.removeParticipant);

module.exports = router;
