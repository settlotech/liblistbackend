const express = require('express');
const router = express.Router();

const taskController = require('../controllers/task.controller');
const authenticate = require('../middleware/auth.middleware');
const {
    validate,
    createTaskSchema,
    updateTaskSchema,
    assignTaskSchema,
    statusUpdateSchema,
    addParticipantSchema,
    addCommentSchema
} = require('../validators/task.validator');

// All task routes require an authenticated user (to associate creator, assignee, pins)
router.use(authenticate);

// TASK USERS (For Assignee and Participant selection) 

router.get('/tasks/users', taskController.getAssignableUsers);

//TASK CATEGORIES (Must precede /tasks/:id) 

router.get('/tasks/common', taskController.getCommonTasks);
router.get('/tasks/pinned', taskController.getPinnedTasks);
router.get('/tasks/general', taskController.getGeneralTasks);

//TASK CRUD 
router.get('/tasks', taskController.getTasks);
router.post('/tasks', validate(createTaskSchema), taskController.createTask);
router.get('/tasks/:id', taskController.getTaskById);
router.put('/tasks/:id', validate(updateTaskSchema), taskController.updateTask);
router.delete('/tasks/:id', taskController.deleteTask);

// ASSIGNMENT
router.put('/tasks/:id/assign', validate(assignTaskSchema), taskController.assignTask);
router.put('/tasks/:id/reassign', validate(assignTaskSchema), taskController.reassignTask);

// STATUS 
router.put('/tasks/:id/status', validate(statusUpdateSchema), taskController.updateTaskStatus);
router.put('/tasks/:id/approve', taskController.approveTask);
router.put('/tasks/:id/cancel', taskController.cancelTask);

// PARTICIPANTS
router.get('/tasks/:id/participants', taskController.getParticipants);
router.post('/tasks/:id/participants', validate(addParticipantSchema), taskController.addParticipant);
router.delete('/tasks/:id/participants/:participantId', taskController.removeParticipant);

// PINS
router.post('/tasks/:id/pin', taskController.pinTask);
router.delete('/tasks/:id/pin', taskController.unpinTask);

//  LOGS COMMENTS 
router.get('/tasks/:id/logs', taskController.getTaskLogs);
router.post('/tasks/:id/comments', validate(addCommentSchema), taskController.addComment);

module.exports = router;
