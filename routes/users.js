const express = require('express');
const router = express.Router();
const {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser
} = require('../controllers/usersController');
const { roleGuard } = require('../middleware/roleGuard');

// GET /api/users - List users (by bank_id or role_type)
router.get('/users', getUsers);

// GET /api/users/:id - Single user
router.get('/users/:id', getUserById);

// POST /api/users - Create new user with assigned role (Admin or Manager only)
router.post('/users', roleGuard(['manager', 'admin']), createUser);

// PUT /api/users/:id - Update user details/role
router.put('/users/:id', roleGuard(['manager', 'admin']), updateUser);

// DELETE /api/users/:id - Deactivate user
router.delete('/users/:id', roleGuard(['manager', 'admin']), deleteUser);

module.exports = router;

