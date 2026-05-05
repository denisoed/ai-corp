import { Router } from 'express';
import { getStore, mutateStore, agentsAreConnected } from '../store';
import { createTaskAssigneeChangedEvent, createTaskCommentAddedEvent, createTaskCompletedEvent, createTaskStatusChangedEvent, publishEvent } from '../events';
import { resumeApprovedCommand } from '../command-runner';

const router = Router();

function logTaskRoute(agentId: string, action: string, details: string, type: 'info' | 'success' | 'warning' | 'error' = 'info', metadata?: Record<string, unknown>) {
  mutateStore(s => {
    s.logs.unshift({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      agentId,
      action,
      details,
      type,
      source: 'system',
      category: 'task',
      metadata,
    });
    if (s.logs.length > 100) s.logs = s.logs.slice(0, 100);
  });
}

router.post('/tasks', (req, res) => {
  const task = {
    ...req.body,
    id: crypto.randomUUID(),
    cost: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    comments: [],
    subtasks: []
  };
  mutateStore(s => {
    s.tasks.push(task);
  });
  logTaskRoute(req.headers['x-agent-id'] as string | undefined || 'system', 'Task Created', `Created task "${task.title}" with status ${task.status}.`, 'success', { taskId: task.id, taskTitle: task.title, toStatus: task.status });
  res.json(task);
});

router.patch('/tasks/:id', (req, res) => {
  const agentId = req.headers['x-agent-id'] as string | undefined;
  const store = getStore();
  const before = store.tasks.find(t => t.id === req.params.id);
  const previousStatus = before?.status;

  if (agentId && req.body.assigneeId) {
    if (!agentsAreConnected(agentId, req.body.assigneeId, store.agents)) {
      const assignee = store.agents.find(a => a.id === req.body.assigneeId);
      return res.status(403).json({ error: `Agent is not connected to "${assignee?.name || req.body.assigneeId}".` });
    }
  }

  mutateStore(s => {
    const idx = s.tasks.findIndex(t => t.id === req.params.id);
    if (idx !== -1) {
      s.tasks[idx] = { ...s.tasks[idx], ...req.body, updatedAt: new Date().toISOString() };
    }
  });
  const updated = getStore().tasks.find(t => t.id === req.params.id);
  if (updated && req.body.assigneeId && updated.assigneeId !== req.body.assigneeId) {
    void publishEvent(createTaskAssigneeChangedEvent(updated, before?.assigneeId, req.body.assigneeId, agentId));
  }
  if (updated && previousStatus && updated.status !== previousStatus) {
    void publishEvent(createTaskStatusChangedEvent(updated, previousStatus, updated.status, agentId));
    if (updated.status === 'Done') {
      void publishEvent(createTaskCompletedEvent(updated, agentId));
    }
  }
  logTaskRoute(agentId || 'system', 'Task Updated', `Updated task ${req.params.id} with fields: ${Object.keys(req.body || {}).join(', ') || 'none'}.`, 'info', { taskId: req.params.id, toStatus: updated?.status, fromStatus: previousStatus });
  res.json(updated);
});

router.post('/tasks/:taskId/comments', (req, res) => {
  const agentId = req.headers['x-agent-id'] as string | undefined;
  const store = getStore();

  if (agentId) {
    const task = store.tasks.find(t => t.id === req.params.taskId);
    if (task?.assigneeId && !agentsAreConnected(agentId, task.assigneeId, store.agents)) {
      const assignee = store.agents.find(a => a.id === task.assigneeId);
      return res.status(403).json({ error: `Agent is not connected to "${assignee?.name || task.assigneeId}".` });
    }
  }

  const comment = { ...req.body, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
  mutateStore(s => {
    const task = s.tasks.find(t => t.id === req.params.taskId);
    if (task) {
      task.comments.push(comment);
      task.updatedAt = new Date().toISOString();
    }
  });
  const updated = getStore().tasks.find(t => t.id === req.params.taskId);
  if (updated) {
    void publishEvent(createTaskCommentAddedEvent(updated, comment, agentId));
  }
  logTaskRoute(agentId || 'system', 'Task Comment Added', `Added comment to task ${req.params.taskId}.`, 'info', { taskId: req.params.taskId, authorName: comment.authorName });
  res.json(updated);
});

router.post('/approvals', (req, res) => {
  const approval = { ...req.body, id: crypto.randomUUID(), status: 'pending', createdAt: new Date().toISOString() };
  mutateStore(s => {
    s.approvals.unshift(approval);
    if (s.approvals.length > 100) s.approvals = s.approvals.slice(0, 100);
  });
  res.json(approval);
});

router.post('/approvals/:id/resolve', (req, res) => {
  const { approved } = req.body;
  let result: any = {};

  mutateStore(s => {
    const approval = s.approvals.find(a => a.id === req.params.id);
    if (!approval) return;

    approval.status = approved ? 'approved' : 'rejected';
    const fixSubtask = { id: crypto.randomUUID(), title: 'Fix issues based on feedback', completed: false };

    if (approval.taskId) {
      const task = s.tasks.find(t => t.id === approval.taskId);
      if (task) {
        const previousStatus = task.status;
        task.status = 'In Progress';
        task.updatedAt = new Date().toISOString();
        if (!approved) {
          task.subtasks.push(fixSubtask);
        }
        task.comments.push({
          id: crypto.randomUUID(),
          authorId: 'user',
          authorName: 'Admin (You)',
          content: approved ? `Approval granted for: ${approval.action}. Proceeding.` : 'Approval denied. Please revise according to comments.',
          createdAt: new Date().toISOString(),
          type: 'action'
        });
        if (task.status !== previousStatus) {
          void publishEvent(createTaskStatusChangedEvent(task, previousStatus, task.status, 'user'));
        }
      }
    }

    if (approval.commandRunId && approved) {
      void resumeApprovedCommand(approval.commandRunId);
    } else if (approval.commandRunId && !approved) {
      const commandRun = s.commandRuns.find(r => r.id === approval.commandRunId);
      if (commandRun) {
        commandRun.status = 'denied';
        commandRun.reason = 'Command approval rejected by user.';
        commandRun.finishedAt = new Date().toISOString();
      }
    }

    if (approval.agentId) {
      const agent = s.agents.find(a => a.id === approval.agentId);
      if (agent) agent.status = 'Idle';
    }

    s.logs.unshift({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      agentId: 'user',
      action: approved ? 'Approval Granted' : 'Approval Rejected',
      details: `User ${approved ? 'approved' : 'rejected'} action: ${approval.action}`,
      type: approved ? 'success' : 'error',
      source: 'system' as const,
      category: 'approval' as const,
      metadata: { approvalId: approval.id, action: approval.action, risk: approval.risk, estimatedCost: approval.estimatedCost, resolvedBy: 'user' },
    });
    if (s.logs.length > 100) s.logs = s.logs.slice(0, 100);

    result = {
      approval,
      tasks: s.tasks,
      agents: s.agents
    };
  });

  logTaskRoute('user', 'Approval Resolved', `Approval ${req.params.id} resolved as ${approved ? 'approved' : 'rejected'}.`, approved ? 'success' : 'warning', { approvalId: req.params.id });

  res.json(result);
});

export default router;
