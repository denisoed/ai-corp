import { Router } from 'express';
import { getStore, mutateStore } from './store';
import { createMemory, loadMemory, getMemoryContext, clearMemory } from './agent-memory';

const router = Router();

router.get('/state', (req, res) => {
  res.json(getStore());
});

router.post('/workspaces', (req, res) => {
  const workspace = {
    ...req.body,
    id: crypto.randomUUID(),
    agentIds: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  mutateStore(s => {
    s.workspaces.push(workspace);
  });
  res.json(workspace);
});

router.get('/folders', async (req, res) => {
  const fs = await import('fs');
  const path = await import('path');

  function readDir(dir: string, depth: number = 0): any {
    if (depth > 2) return null;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const items = [];
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '__pycache__') continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          items.push({
            name: entry.name,
            path: fullPath,
            type: 'directory',
            children: depth < 2 ? undefined : undefined
          });
        } else {
          items.push({ name: entry.name, path: fullPath, type: 'file' });
        }
      }
      return items.sort((a: any, b: any) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    } catch {
      return null;
    }
  }

  const targetPath = (req.query.path as string) || (process.env.HOME || '');
  if (!targetPath) {
    return res.status(400).json({ error: 'No path specified and HOME not set' });
  }
  const name = targetPath.split('/').pop() || targetPath;
  const items = readDir(targetPath) || [];
  res.json([{ name, path: targetPath, type: 'directory', children: items }]);
});

router.patch('/workspaces/:id', (req, res) => {
  mutateStore(s => {
    const idx = s.workspaces.findIndex(w => w.id === req.params.id);
    if (idx !== -1) {
      s.workspaces[idx] = { ...s.workspaces[idx], ...req.body, updatedAt: new Date().toISOString() };
    }
  });
  const updated = getStore().workspaces.find(w => w.id === req.params.id);
  res.json(updated);
});

router.delete('/workspaces/:id', (req, res) => {
  mutateStore(s => {
    s.workspaces = s.workspaces.filter(w => w.id !== req.params.id);
    s.agents.forEach(a => {
      if (a.workspaceId === req.params.id) {
        a.workspaceId = undefined;
      }
    });
  });
  res.json({ success: true });
});

router.post('/agents', (req, res) => {
  const agent = { ...req.body, id: crypto.randomUUID() };
  mutateStore(s => {
    s.agents.push(agent);
  });

  const store = getStore();
  const workspace = agent.workspaceId
    ? store.workspaces.find(w => w.id === agent.workspaceId)
    : undefined;
  createMemory(agent, workspace);

  res.json(agent);
});

router.patch('/agents/:id', (req, res) => {
  const store = getStore();
  const agent = store.agents.find(a => a.id === req.params.id);
  const oldWorkspaceId = agent?.workspaceId;
  const newWorkspaceId = req.body.workspaceId;
  const workspaceChanged = newWorkspaceId !== undefined && newWorkspaceId !== oldWorkspaceId;

  mutateStore(s => {
    const idx = s.agents.findIndex(a => a.id === req.params.id);
    if (idx !== -1) {
      const oldWsId = s.agents[idx].workspaceId;
      const newWsId = req.body.workspaceId;

      if (newWsId !== undefined && newWsId !== oldWsId) {
        if (oldWsId) {
          const oldWsIdx = s.workspaces.findIndex(w => w.id === oldWsId);
          if (oldWsIdx !== -1) {
            s.workspaces[oldWsIdx].agentIds = s.workspaces[oldWsIdx].agentIds.filter(id => id !== req.params.id);
          }
        }
        if (newWsId) {
          const newWsIdx = s.workspaces.findIndex(w => w.id === newWsId);
          if (newWsIdx !== -1 && !s.workspaces[newWsIdx].agentIds.includes(req.params.id)) {
            s.workspaces[newWsIdx].agentIds.push(req.params.id);
          }
        }
      }

      s.agents[idx] = { ...s.agents[idx], ...req.body };
    }
  });

  if (workspaceChanged) {
    clearMemory(req.params.id);
    const updatedStore = getStore();
    const updatedAgent = updatedStore.agents.find(a => a.id === req.params.id);
    const workspace = newWorkspaceId
      ? updatedStore.workspaces.find(w => w.id === newWorkspaceId)
      : undefined;
    if (updatedAgent) {
      createMemory(updatedAgent, workspace);
    }
  }

  const updated = getStore().agents.find(a => a.id === req.params.id);
  res.json(updated);
});

router.delete('/agents/:id', (req, res) => {
  mutateStore(s => {
    s.agents = s.agents.filter(a => a.id !== req.params.id);
  });
  clearMemory(req.params.id);
  res.json({ success: true });
});

router.get('/agents/:id/memory', (req, res) => {
  const memory = loadMemory(req.params.id);
  if (!memory) return res.status(404).json({ error: 'No memory found for this agent' });
  res.json(memory);
});

router.get('/agents/:id/memory/context', (req, res) => {
  const context = getMemoryContext(req.params.id);
  if (!context) return res.status(404).json({ error: 'No memory context found for this agent' });
  res.type('text/markdown');
  res.send(context);
});

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

router.post('/logs', (req, res) => {
  const log = { ...req.body, id: crypto.randomUUID(), timestamp: new Date().toISOString() };
  mutateStore(s => {
    s.logs.unshift(log);
    if (s.logs.length > 100) s.logs = s.logs.slice(0, 100);
  });
  res.json(log);
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

router.post('/templates/apply', (req, res) => {
  const template = req.body;
  const newAgentIds = template.agents.map(() => crypto.randomUUID());

  mutateStore(s => {
    const newAgents = template.agents.map((a: any, i: number) => ({
      ...a,
      id: newAgentIds[i],
      parentId: a.parentIndex !== undefined ? newAgentIds[a.parentIndex] : undefined,
      status: 'Idle' as const
    }));

    const newTasks = template.tasks.map((t: any) => ({
      id: crypto.randomUUID(),
      title: t.title,
      description: t.description,
      status: t.status,
      priority: t.priority,
      risk: 'medium' as const,
      cost: 0,
      tags: t.tags,
      assigneeId: t.assigneeIndex !== undefined ? newAgentIds[t.assigneeIndex] : undefined,
      creatorId: 'system',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      comments: [],
      subtasks: t.subtasks ? t.subtasks.map((st: string) => ({ id: crypto.randomUUID(), title: st, completed: false })) : []
    }));

    s.agents = newAgents;
    s.tasks = newTasks;
    s.logs = [{
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      agentId: 'system',
      action: 'Template Applied',
      details: `Started new company with template: ${template.name}`,
      type: 'success'
    }];
    s.isAutopilot = true;
  });

  const storeAfter = getStore();
  for (const agent of storeAfter.agents) {
    const ws = agent.workspaceId
      ? storeAfter.workspaces.find(w => w.id === agent.workspaceId)
      : undefined;
    createMemory(agent, ws);
  }

  res.json(getStore());
});

router.post('/autopilot/toggle', (req, res) => {
  let log: any;
  mutateStore(s => {
    s.isAutopilot = !s.isAutopilot;
    log = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      agentId: 'system',
      action: s.isAutopilot ? 'Autopilot Engaged' : 'Autopilot Disabled',
      details: s.isAutopilot ? 'AI Orchestration engine has taken over.' : 'System set to manual mode.',
      type: 'info'
    };
    s.logs.unshift(log);
    if (s.logs.length > 100) s.logs = s.logs.slice(0, 100);
  });
  res.json({ isAutopilot: getStore().isAutopilot, log });
});

export default router;
