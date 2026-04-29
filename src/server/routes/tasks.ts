import { Router } from 'express';
import { getStore, mutateStore, agentsAreConnected } from '../store';

const router = Router();

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
  res.json(task);
});

router.patch('/tasks/:id', (req, res) => {
  const agentId = req.headers['x-agent-id'] as string | undefined;
  const store = getStore();

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
        task.status = approved ? 'Review' : 'In Progress';
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
      type: approved ? 'success' : 'error'
    });
    if (s.logs.length > 100) s.logs = s.logs.slice(0, 100);

    result = {
      approval,
      tasks: s.tasks,
      agents: s.agents
    };
  });

  res.json(result);
});

export default router;
