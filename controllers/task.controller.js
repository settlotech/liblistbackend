const taskModel = require('../models/task.model');
const pool = require('../config/db');

const taskController = {
    // ── GET ASSIGNABLE USERS ─────────────────────────────────────────────
    async getAssignableUsers(req, res) {
        try {
            const { search } = req.query;
            const users = await taskModel.getAssignableUsers(search);
            return res.status(200).json({ success: true, data: users });
        } catch (err) {
            console.error('Error fetching assignable users:', err);
            return res.status(500).json({ success: false, message: 'Failed to fetch users' });
        }
    },

    // ── GET ALL TASKS ────────────────────────────────────────────────────
    async getTasks(req, res) {
        try {
            const { search, page, limit } = req.query;
            const result = await taskModel.getTasks({
                category: 'all',
                search,
                page,
                limit,
                userId: req.user?.id
            });
            return res.status(200).json({ success: true, data: result.tasks, pagination: result.pagination });
        } catch (err) {
            console.error('Error fetching tasks:', err);
            return res.status(500).json({ success: false, message: 'Failed to fetch tasks' });
        }
    },

    // ── GET COMMON TASKS ─────────────────────────────────────────────────
    async getCommonTasks(req, res) {
        try {
            const { search, page, limit } = req.query;
            const result = await taskModel.getTasks({
                category: 'common',
                search,
                page,
                limit,
                userId: req.user?.id
            });
            return res.status(200).json({ success: true, data: result.tasks, pagination: result.pagination });
        } catch (err) {
            console.error('Error fetching common tasks:', err);
            return res.status(500).json({ success: false, message: 'Failed to fetch common tasks' });
        }
    },

    // ── GET PINNED TASKS ─────────────────────────────────────────────────
    async getPinnedTasks(req, res) {
        try {
            const { search, page, limit } = req.query;
            const result = await taskModel.getTasks({
                category: 'pinned',
                search,
                page,
                limit,
                userId: req.user?.id
            });
            return res.status(200).json({ success: true, data: result.tasks, pagination: result.pagination });
        } catch (err) {
            console.error('Error fetching pinned tasks:', err);
            return res.status(500).json({ success: false, message: 'Failed to fetch pinned tasks' });
        }
    },

    // ── GET GENERAL TASKS ────────────────────────────────────────────────
    async getGeneralTasks(req, res) {
        try {
            const { search, page, limit } = req.query;
            const result = await taskModel.getTasks({
                category: 'general',
                search,
                page,
                limit,
                userId: req.user?.id
            });
            return res.status(200).json({ success: true, data: result.tasks, pagination: result.pagination });
        } catch (err) {
            console.error('Error fetching general tasks:', err);
            return res.status(500).json({ success: false, message: 'Failed to fetch general tasks' });
        }
    },

    // ── GET SINGLE TASK ──────────────────────────────────────────────────
    async getTaskById(req, res) {
        try {
            const taskId = req.params.id;
            const task = await taskModel.getTaskById(taskId, req.user?.id);
            if (!task) {
                return res.status(404).json({ success: false, message: 'Task not found' });
            }
            return res.status(200).json({ success: true, data: task });
        } catch (err) {
            console.error('Error fetching task:', err);
            return res.status(500).json({ success: false, message: 'Failed to fetch task' });
        }
    },

    // ── CREATE TASK (Type 1: Right-Click Context Menu) ────────────────────
    async createTask(req, res) {
        try {
            const { title, description, category, due_date, library_id, section_id, assigned_to, assignees, participants } = req.body;
            const created_by = req.user?.id;

            const task = await taskModel.createTask({
                title,
                description,
                category: category || 'general',
                due_date,
                library_id,
                section_id,
                created_by,
                assigned_to,
                assignees,
                participants
            });

            return res.status(201).json({
                success: true,
                message: 'Task created successfully',
                data: task
            });
        } catch (err) {
            console.error('Error creating task:', err);
            return res.status(500).json({ success: false, message: 'Failed to create task' });
        }
    },

    // ── UPDATE TASK ──────────────────────────────────────────────────────
    async updateTask(req, res) {
        try {
            const taskId = req.params.id;
            const updated = await taskModel.updateTask(taskId, req.body);
            if (!updated) {
                return res.status(404).json({ success: false, message: 'Task not found' });
            }
            return res.status(200).json({ success: true, message: 'Task updated', data: updated });
        } catch (err) {
            console.error('Error updating task:', err);
            return res.status(500).json({ success: false, message: 'Failed to update task' });
        }
    },

    // ── DELETE TASK ──────────────────────────────────────────────────────
    async deleteTask(req, res) {
        try {
            const taskId = req.params.id;

            // Fetch the task first to check ownership / permissions
            const task = await taskModel.getTaskById(taskId);
            if (!task) {
                return res.status(404).json({ success: false, message: 'Task not found' });
            }

            // Verify author or Super Admin permission
            const isAuthor = task.created_by && String(task.created_by) === String(req.user?.id);
            const isSuperAdmin =
                req.user?.isSuperAdmin === true ||
                (req.user?.role || '').toLowerCase() === 'super admin' ||
                (req.user?.role || '').toLowerCase() === 'super_admin' ||
                (Array.isArray(req.user?.roles) && req.user.roles.some(r => {
                    const rName = (typeof r === 'string' ? r : r.role_name || '').toLowerCase();
                    return rName === 'super admin' || rName === 'super_admin';
                }));

            if (!isAuthor && !isSuperAdmin) {
                return res.status(403).json({
                    success: false,
                    message: 'Only the author of this task or a Super Admin can delete it.'
                });
            }

            const deleted = await taskModel.deleteTask(taskId);
            if (!deleted) {
                return res.status(404).json({ success: false, message: 'Task not found' });
            }
            return res.status(200).json({ success: true, message: 'Task deleted' });
        } catch (err) {
            console.error('Error deleting task:', err);
            return res.status(500).json({ success: false, message: 'Failed to delete task' });
        }
    },

    // ── ASSIGN / REASSIGN ────────────────────────────────────────────────
    async assignTask(req, res) {
        try {
            const taskId = req.params.id;
            const { assigned_to, comment } = req.body;
            await taskModel.assignTask(taskId, assigned_to, req.user?.id, comment);
            return res.status(200).json({ success: true, message: 'Task assignment updated' });
        } catch (err) {
            console.error('Error assigning task:', err);
            return res.status(500).json({ success: false, message: err.message || 'Failed to assign task' });
        }
    },

    async reassignTask(req, res) {
        return taskController.assignTask(req, res);
    },

    // ── UPDATE STATUS (With Role & Cancellation checks per Image 2) ───────
    async updateStatus(req, res) {
        try {
            const taskId = req.params.id;
            const { status, comment } = req.body;
            const userId = req.user?.id;

            const task = await taskModel.getTaskById(taskId, userId);
            if (!task) {
                return res.status(404).json({ success: false, message: 'Task not found' });
            }

            // Image 2 Rule 1: "cancelled applicable only for self made requests"
            if (status === 'cancelled') {
                const isCreator = task.created_by === userId;
                const isAdmin = req.user?.role === 'Super Admin' || req.user?.role === 'Admin';
                if (!isCreator && !isAdmin) {
                    return res.status(403).json({
                        success: false,
                        message: 'Cancellation is only applicable for self-made requests.'
                    });
                }
            }

            // Image 2 Rule 2: "Approved only when the user is the approver role"
            if (status === 'approved') {
                const isApproverParticipant = (task.participants || []).some(
                    p => p.user_id === userId && p.role === 'approver'
                );
                const hasApproverRole = req.user?.role === 'Approver' || req.user?.role === 'Super Admin';
                if (!isApproverParticipant && !hasApproverRole) {
                    return res.status(403).json({
                        success: false,
                        message: 'Approval is restricted to users with the Approver role.'
                    });
                }
            }

            await taskModel.updateStatus(taskId, status, comment, userId);
            return res.status(200).json({ success: true, message: `Task status updated to ${status}` });
        } catch (err) {
            console.error('Error updating status:', err);
            return res.status(500).json({ success: false, message: 'Failed to update status' });
        }
    },

    // ── APPROVE ──────────────────────────────────────────────────────────
    async approveTask(req, res) {
        req.body.status = 'approved';
        return taskController.updateStatus(req, res);
    },

    // ── CANCEL ───────────────────────────────────────────────────────────
    async cancelTask(req, res) {
        req.body.status = 'cancelled';
        return taskController.updateStatus(req, res);
    },

    // ── PIN / UNPIN ──────────────────────────────────────────────────────
    async pinTask(req, res) {
        try {
            const taskId = req.params.id;
            await taskModel.pinTask(taskId, req.user?.id);
            return res.status(200).json({ success: true, message: 'Task pinned' });
        } catch (err) {
            console.error('Error pinning task:', err);
            return res.status(500).json({ success: false, message: 'Failed to pin task' });
        }
    },

    async unpinTask(req, res) {
        try {
            const taskId = req.params.id;
            await taskModel.unpinTask(taskId, req.user?.id);
            return res.status(200).json({ success: true, message: 'Task unpinned' });
        } catch (err) {
            console.error('Error unpinning task:', err);
            return res.status(500).json({ success: false, message: 'Failed to unpin task' });
        }
    },

    // ── LOGS & COMMENTS ──────────────────────────────────────────────────
    async getTaskLogs(req, res) {
        try {
            const taskId = req.params.id;
            const logs = await taskModel.getTaskLogs(taskId);
            return res.status(200).json({ success: true, data: logs });
        } catch (err) {
            console.error('Error fetching task logs:', err);
            return res.status(500).json({ success: false, message: 'Failed to fetch logs' });
        }
    },

    async addComment(req, res) {
        try {
            const taskId = req.params.id;
            const { comment } = req.body;
            const log = await taskModel.addComment(taskId, comment, req.user?.id);
            return res.status(201).json({ success: true, message: 'Comment added', data: log });
        } catch (err) {
            console.error('Error adding comment:', err);
            return res.status(500).json({ success: false, message: 'Failed to add comment' });
        }
    },

    // ── PARTICIPANTS ─────────────────────────────────────────────────────
    async getParticipants(req, res) {
        try {
            const taskId = req.params.id;
            const participants = await taskModel.getParticipants(taskId);
            return res.status(200).json({ success: true, data: participants });
        } catch (err) {
            console.error('Error fetching participants:', err);
            return res.status(500).json({ success: false, message: 'Failed to fetch participants' });
        }
    },

    async addParticipant(req, res) {
        try {
            const taskId = req.params.id;
            const { user_id, role } = req.body;
            const p = await taskModel.addParticipant(taskId, user_id, role);
            return res.status(201).json({ success: true, message: 'Participant added', data: p });
        } catch (err) {
            console.error('Error adding participant:', err);
            return res.status(500).json({ success: false, message: 'Failed to add participant' });
        }
    },

    async removeParticipant(req, res) {
        try {
            const { id: taskId, participantId } = req.params;
            await taskModel.removeParticipant(taskId, participantId);
            return res.status(200).json({ success: true, message: 'Participant removed' });
        } catch (err) {
            console.error('Error removing participant:', err);
            return res.status(500).json({ success: false, message: 'Failed to remove participant' });
        }
    },

    // ── ASSIGNEE GROUPS ──────────────────────────────────────────────────
    async getAssigneeGroups(req, res) {
        try {
            const groups = await taskModel.getAssigneeGroups();
            return res.status(200).json({ success: true, data: groups });
        } catch (err) {
            console.error('Error fetching assignee groups:', err);
            return res.status(500).json({ success: false, message: 'Failed to fetch groups' });
        }
    },

    async createAssigneeGroup(req, res) {
        try {
            const { name, description, member_ids } = req.body;
            const group = await taskModel.createAssigneeGroup({
                name,
                description,
                created_by: req.user?.id,
                member_ids
            });
            return res.status(201).json({ success: true, data: group, message: 'Group created successfully' });
        } catch (err) {
            console.error('Error creating assignee group:', err);
            return res.status(500).json({ success: false, message: 'Failed to create group' });
        }
    },

    async deleteAssigneeGroup(req, res) {
        try {
            const { groupId } = req.params;
            await taskModel.deleteAssigneeGroup(groupId);
            return res.status(200).json({ success: true, message: 'Group deleted successfully' });
        } catch (err) {
            console.error('Error deleting assignee group:', err);
            return res.status(500).json({ success: false, message: 'Failed to delete group' });
        }
    }
};

module.exports = taskController;
