const express = require('express');
const router = express.Router();
const tasksController = require('../controllers/tasksController');
const authenticate = require('../middleware/auth.middleware');
const { checkPermission } = require('../middleware/role.middleware');

// Protect all task endpoints with JWT authentication
router.use(authenticate);

router.get('/tasks', checkPermission('tasks', 'read'), tasksController.getTasks);
router.post('/tasks', checkPermission('tasks', 'create'), tasksController.createTask);
router.patch('/tasks/:id', checkPermission('tasks', 'update'), tasksController.updateTask);
router.delete('/tasks/:id', checkPermission('tasks', 'delete'), tasksController.deleteTask);

module.exports = router;
