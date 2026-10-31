const express = require('express');
const router = express.Router();
const {
  getPolicies,
  getPolicyById,
  createPolicy,
  updatePolicy,
  togglePolicyStatus,
  togglePolicyMasking,
  deletePolicy,
  addContextualArtifact,
  getContextualArtifacts
} = require('../controllers/policyController');
const { roleGuard } = require('../middleware/roleGuard');

// GET /api/policies - Lightweight list
router.get('/policies', getPolicies);

// GET /api/policies/:id - Full details + lazy load
router.get('/policies/:id', getPolicyById);

// POST /api/policies - Create policy (role-aware: draft for employee, active for manager)
router.post('/policies', createPolicy);

// PUT /api/policies/:id - Update content / limits / drafts (Controller handles role logic)
router.put('/policies/:id', updatePolicy);

// PATCH /api/policies/:id/status - Toggle status or publish draft
router.patch('/policies/:id/status', togglePolicyStatus);

// PATCH /api/policies/:id/mask - Mask confidential doc
router.patch('/policies/:id/mask', togglePolicyMasking);

// DELETE /api/policies/:id - Delete policy (Drafts can be deleted by author, active requires manager/admin)
router.delete('/policies/:id', deletePolicy);

// GET /api/policies/:id/artifacts - Get contextual artifacts (training, reports, etc.)
router.get('/policies/:id/artifacts', getContextualArtifacts);

// POST /api/policies/:id/artifacts - Approver / Manager adds training session or artifact
router.post('/policies/:id/artifacts', roleGuard(['manager', 'admin']), addContextualArtifact);

module.exports = router;
