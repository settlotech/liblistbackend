const express = require('express');
const router = express.Router();
const tasksController = require('../controllers/tasksController');
const authenticate = require('../middleware/auth.middleware');

// Protect all task endpoints with JWT authentication (Common for all users)
router.use(authenticate);

router.get('/tasks', tasksController.getTasks);
router.post('/tasks', tasksController.createTask);
router.patch('/tasks/:id', tasksController.updateTask);
router.delete('/tasks/:id', tasksController.deleteTask);

module.exports = router;
