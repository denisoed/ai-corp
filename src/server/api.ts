import { Router } from 'express';
import { getStore, mutateStore, agentsAreConnected, removeConnectionFromStore, addConnectionToStore, ensureDefaultRoles, assignDefaultRole, getRolesByWorkspace, hasPermission } from './store';
import { createMemory, loadMemory, getMemoryContext, clearMemory, readPersonalityFile, writePersonalityFile, getAllPersonalityFiles } from './agent-memory';
import { listCronJobs, createCronJob, updateCronJob, deleteCronJob, runCronNow } from './cron';
import yaml from 'js-yaml';
import fs from 'fs';
import path from 'path';
import { WorkspaceDefinition } from '../types';

const router = Router();

function generateSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

router.get('/state', (req, res) => {
  res.json(getStore());
});

router.post('/workspaces', (req, res) => {
  const workspace = {
    ...req.body,
    id: crypto.randomUUID(),
    slug: req.body.slug || generateSlug(req.body.name),
    agentIds: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  mutateStore(s => {
    s.workspaces.push(workspace);
  });
  ensureDefaultRoles(workspace.id);
  res.json(workspace);
});

router.get('/folders', async (req, res) => {
  const fs = await import('fs');
  const path = await import('path');

  function readDir(dir: string): any {
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
            children: undefined
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

  let targetPath = (req.query.path as string) || (process.env.HOME || '');
  if (!targetPath) {
    return res.status(400).json({ error: 'No path specified and HOME not set' });
  }

  const resolvedTarget = path.resolve(targetPath);
  if (!path.isAbsolute(targetPath)) {
    return res.status(400).json({ error: 'Path must be absolute' });
  }

  const name = resolvedTarget.split('/').pop() || resolvedTarget;
  const items = readDir(resolvedTarget) || [];
  res.json([{ name, path: resolvedTarget, type: 'directory', children: items }]);
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
  const { soul, identity, roleDoc, roleIds, ...agentData } = req.body;
  const agentId = req.headers['x-agent-id'] as string | undefined;
  const store = getStore();

  if (agentId && agentData.parentId && !agentsAreConnected(agentId, agentData.parentId, store.agents)) {
    const parent = store.agents.find(a => a.id === agentData.parentId);
    return res.status(403).json({ error: `Agent is not connected to "${parent?.name || agentData.parentId}".` });
  }

  if (!agentData.workspaceId) {
    return res.status(400).json({ error: 'workspaceId is required. Agents must be assigned to a workspace.' });
  }
  const workspace = getStore().workspaces.find(w => w.id === agentData.workspaceId);
  if (!workspace) {
    return res.status(400).json({ error: `Workspace ${agentData.workspaceId} not found` });
  }

  const agent = {
    ...agentData,
    id: crypto.randomUUID(),
    slug: agentData.slug || generateSlug(agentData.name),
    roleIds: Array.isArray(roleIds) ? roleIds : undefined,
  };
  mutateStore(s => {
    s.agents.push(agent);
    const ws = s.workspaces.find(w => w.id === agent.workspaceId);
    if (ws && !ws.agentIds.includes(agent.id)) {
      ws.agentIds.push(agent.id);
    }
  });

  createMemory(agent, workspace);
  ensureDefaultRoles(agent.workspaceId);
  if (!agent.roleIds || agent.roleIds.length === 0) {
    assignDefaultRole(agent.id);
  }

  if (soul) writePersonalityFile(agent.id, 'SOUL.md', soul);
  if (identity) writePersonalityFile(agent.id, 'IDENTITY.md', identity);
  if (roleDoc) writePersonalityFile(agent.id, 'ROLE.md', roleDoc);

  res.json(agent);
});

router.patch('/agents/:id', (req, res) => {
  const store = getStore();
  const agent = store.agents.find(a => a.id === req.params.id);

  // Prevent removing an agent from its workspace
  if (req.body.workspaceId === null || req.body.workspaceId === '') {
    return res.status(400).json({ error: 'workspaceId cannot be removed. Agents must always belong to a workspace.' });
  }

  const oldWorkspaceId = agent?.workspaceId;
  const newWorkspaceId = req.body.workspaceId;
  const workspaceChanged = newWorkspaceId !== undefined && newWorkspaceId !== oldWorkspaceId;

  if (workspaceChanged) {
    const targetWorkspace = store.workspaces.find(w => w.id === newWorkspaceId);
    if (!targetWorkspace) {
      return res.status(400).json({ error: `Workspace ${newWorkspaceId} not found` });
    }
  }

  mutateStore(s => {
    const idx = s.agents.findIndex(a => a.id === req.params.id);
    if (idx === -1) return;

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

    const oldAgent = s.agents[idx];
    const oldCollabs: string[] = oldAgent.collaborators || [];
    const newCollabs: string[] | undefined = req.body.collaborators;

    const oldParentId = oldAgent.parentId;
    const newParentId = req.body.parentId;

    s.agents[idx] = { ...oldAgent, ...req.body };

    if (newCollabs !== undefined) {
      const added = newCollabs.filter(id => !oldCollabs.includes(id));
      const removed = oldCollabs.filter(id => !newCollabs.includes(id));

      for (const targetId of added) {
        const target = s.agents.find(a => a.id === targetId);
        if (target) {
          if (!target.collaborators) target.collaborators = [];
          if (!target.collaborators.includes(req.params.id)) {
            target.collaborators.push(req.params.id);
          }
        }
      }
      for (const targetId of removed) {
        const target = s.agents.find(a => a.id === targetId);
        if (target?.collaborators) {
          target.collaborators = target.collaborators.filter(id => id !== req.params.id);
        }
      }
    }

    if (newParentId !== undefined && newParentId !== oldParentId) {
      if (oldParentId) {
        removeConnectionFromStore(s, req.params.id, oldParentId);
      }
      if (newParentId) {
        addConnectionToStore(s, req.params.id, newParentId, 'subordinate');
      }
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
  const { workspaceId, ...template } = req.body;

  if (!workspaceId) {
    return res.status(400).json({ error: 'workspaceId is required to apply a template' });
  }
  const targetWorkspace = getStore().workspaces.find(w => w.id === workspaceId);
  if (!targetWorkspace) {
    return res.status(400).json({ error: `Workspace ${workspaceId} not found` });
  }

  const newAgentIds = template.agents.map(() => crypto.randomUUID());
  const slugToId: Record<string, string> = {};

  mutateStore(s => {
    const newAgents = template.agents.map((a: any, i: number) => {
      const agentId = newAgentIds[i];
      const slug = a.slug || generateSlug(a.name);
      slugToId[slug] = agentId;
      return {
        id: agentId,
        name: a.name,
        slug,
        model: a.model,
        role: a.role,
        description: a.description,
        skills: a.skills,
        parentId: undefined,
        collaborators: [],
        status: 'Idle' as const,
        workspaceId
      };
    });

    for (const agent of newAgents) {
      const tmpl = template.agents.find((a: any) => (a.slug || generateSlug(a.name)) === agent.slug);
      if (tmpl?.parentSlug && slugToId[tmpl.parentSlug]) {
        agent.parentId = slugToId[tmpl.parentSlug];
      }
      if (tmpl?.collaborators) {
        agent.collaborators = tmpl.collaborators
          .map((cs: string) => slugToId[cs])
          .filter(Boolean);
      }
    }

    const newTasks = template.tasks.map((t: any) => ({
      id: crypto.randomUUID(),
      title: t.title,
      description: t.description,
      status: t.status,
      priority: t.priority,
      risk: 'medium' as const,
      cost: 0,
      tags: t.tags,
      assigneeId: t.assigneeSlug ? (slugToId[t.assigneeSlug] || undefined) : undefined,
      creatorId: 'system',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      comments: [],
      subtasks: t.subtasks ? t.subtasks.map((st: string) => ({ id: crypto.randomUUID(), title: st, completed: false })) : []
    }));

    for (const agent of newAgents) {
      s.agents.push(agent);
    }
    for (const task of newTasks) {
      s.tasks.push(task);
    }

    const ws = s.workspaces.find(w => w.id === workspaceId);
    if (ws) {
      for (const id of newAgentIds) {
        if (!ws.agentIds.includes(id)) ws.agentIds.push(id);
      }
    }

    s.logs.push({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      agentId: 'system',
      action: 'Template Applied',
      details: `Deployed template "${template.name}" to workspace "${targetWorkspace.name}"`,
      type: 'success'
    });
  });

  const storeAfter = getStore();
  ensureDefaultRoles(workspaceId);
  for (let i = 0; i < newAgentIds.length; i++) {
    const agent = storeAfter.agents.find(a => a.id === newAgentIds[i]);
    if (!agent) continue;
    const ws = agent.workspaceId
      ? storeAfter.workspaces.find(w => w.id === agent.workspaceId)
      : undefined;
    if (ws) {
      createMemory(agent, ws);
      assignDefaultRole(agent.id);      const tmpl = template.agents[i];
      if (tmpl?.soul) writePersonalityFile(agent.id, 'SOUL.md', tmpl.soul);
      if (tmpl?.identity) writePersonalityFile(agent.id, 'IDENTITY.md', tmpl.identity);
      if (tmpl?.role_doc) writePersonalityFile(agent.id, 'ROLE.md', tmpl.role_doc);
    }
  }

  res.json(getStore());
});

router.get('/agents/:id/personality', (req, res) => {
  const { id } = req.params;
  try {
    const files = getAllPersonalityFiles(id);
    res.json(files);
  } catch (e) {
    res.status(500).json({ error: 'Failed to read personality files' });
  }
});

router.get('/agents/:id/personality/:filename', (req, res) => {
  const { id, filename } = req.params;
  const allowed = ['SOUL.md', 'IDENTITY.md', 'ROLE.md'];
  if (!allowed.includes(filename)) {
    return res.status(400).json({ error: `Invalid file. Allowed: ${allowed.join(', ')}` });
  }
  try {
    const content = readPersonalityFile(id, filename as any);
    res.json({ filename, content });
  } catch (e) {
    res.status(500).json({ error: 'Failed to read personality file' });
  }
});

router.put('/agents/:id/personality/:filename', (req, res) => {
  const { id, filename } = req.params;
  const allowed = ['SOUL.md', 'IDENTITY.md', 'ROLE.md'];
  if (!allowed.includes(filename)) {
    return res.status(400).json({ error: `Invalid file. Allowed: ${allowed.join(', ')}` });
  }
  const { content } = req.body;
  if (typeof content !== 'string') {
    return res.status(400).json({ error: 'Content must be a string' });
  }
  try {
    writePersonalityFile(id, filename as any, content);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to write personality file' });
  }
});

router.post('/workspaces/init', (req, res) => {
  const { folderPath } = req.body;
  if (!folderPath) {
    return res.status(400).json({ error: 'folderPath is required' });
  }

  const ymlPath = path.join(folderPath, '.aicorp.yml');
  if (!fs.existsSync(ymlPath)) {
    return res.status(404).json({ error: `.aicorp.yml not found in ${folderPath}` });
  }

  let def: WorkspaceDefinition;
  try {
    const raw = fs.readFileSync(ymlPath, 'utf8');
    def = yaml.load(raw) as WorkspaceDefinition;
  } catch (e: any) {
    return res.status(400).json({ error: `Failed to parse .aicorp.yml: ${e.message}` });
  }

  if (!def.workspace?.slug) {
    return res.status(400).json({ error: 'workspace.slug is required in .aicorp.yml' });
  }

  const existing = getStore().workspaces.find(w => w.slug === def.workspace.slug);
  if (existing) {
    return res.status(409).json({ error: `Workspace with slug "${def.workspace.slug}" already exists` });
  }

  const wsId = crypto.randomUUID();
  const agentIds: string[] = [];
  const slugToId = new Map<string, string>();

  // Create agent IDs and slug→id mapping
  for (const a of def.agents || []) {
    const id = crypto.randomUUID();
    slugToId.set(a.slug, id);
    agentIds.push(id);
  }

  mutateStore(s => {
    const ws = {
      id: wsId,
      name: def.workspace.slug,
      slug: def.workspace.slug,
      description: def.workspace.description || '',
      folderPath,
      agentIds,
      color: '#6366f1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    s.workspaces.push(ws);

    for (const a of def.agents || []) {
      const agentId = slugToId.get(a.slug)!;
      s.agents.push({
        id: agentId,
        name: a.name,
        slug: a.slug,
        role: a.role,
        skills: a.skills || [],
        description: a.description || '',
        parentId: a.parent ? slugToId.get(a.parent) : undefined,
        collaborators: (a.collaborators || []).map(s => slugToId.get(s)).filter(Boolean) as string[],
        status: 'Idle',
        workspaceId: wsId
      });
    }

    if (def.tasks) {
      for (const t of def.tasks) {
        s.tasks.push({
          id: crypto.randomUUID(),
          title: t.title,
          description: t.description || '',
          status: t.status || 'Backlog',
          priority: t.priority || 'Medium',
          risk: 'medium',
          cost: 0,
          assigneeId: t.assignee ? slugToId.get(t.assignee) : undefined,
          creatorId: 'system',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          comments: [],
          tags: t.tags || [],
          subtasks: (t.subtasks || []).map(st => ({ id: crypto.randomUUID(), title: st, completed: false }))
        });
      }
    }

    s.logs.unshift({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      agentId: 'system',
      action: 'Workspace Initialized from .aicorp.yml',
      details: `Initialized "${def.workspace.slug}" with ${def.agents?.length || 0} agents from ${folderPath}`,
      type: 'success'
    });
    if (s.logs.length > 100) s.logs = s.logs.slice(0, 100);
  });

  // Create memory and personality files
  ensureDefaultRoles(wsId);
  const storeAfter = getStore();
  const ws = storeAfter.workspaces.find(w => w.id === wsId)!;
  for (const a of storeAfter.agents.filter(a => a.workspaceId === wsId)) {
    createMemory(a, ws);
    assignDefaultRole(a.id);
    const defAgent = def.agents?.find(d => d.slug === a.slug);
    if (defAgent) {
      if (defAgent.soul) writePersonalityFile(a.id, 'SOUL.md', defAgent.soul);
      if (defAgent.identity) writePersonalityFile(a.id, 'IDENTITY.md', defAgent.identity);
      if (defAgent.role_doc) writePersonalityFile(a.id, 'ROLE.md', defAgent.role_doc);
    }
  }

  res.json(getStore());
});

// --- Roles API ---

router.get('/roles', (req, res) => {
  const workspaceId = req.query.workspaceId as string | undefined;
  if (workspaceId) {
    res.json(getRolesByWorkspace(workspaceId));
  } else {
    res.json(getStore().roles);
  }
});

router.post('/roles', (req, res) => {
  const { name, description, workspaceId } = req.body;
  if (!name || !workspaceId) {
    return res.status(400).json({ error: 'name and workspaceId are required' });
  }

  const existing = getStore().roles.find(r => r.workspaceId === workspaceId && r.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    return res.status(409).json({ error: `Role "${name}" already exists in this workspace` });
  }

  const now = new Date().toISOString();
  const role = {
    id: crypto.randomUUID(),
    workspaceId,
    name,
    description: description || '',
    permissions: [],
    createdAt: now,
    updatedAt: now,
  };

  mutateStore(s => {
    s.roles.push(role);
  });

  res.json(role);
});

router.patch('/roles/:id', (req, res) => {
  const role = getStore().roles.find(r => r.id === req.params.id);
  if (!role) return res.status(404).json({ error: 'Role not found' });

  let updated: any = null;
  mutateStore(s => {
    const r = s.roles.find(x => x.id === req.params.id);
    if (r) {
      if (req.body.name !== undefined) r.name = req.body.name;
      if (req.body.description !== undefined) r.description = req.body.description;
      if (req.body.permissions !== undefined) r.permissions = req.body.permissions;
      r.updatedAt = new Date().toISOString();
      updated = r;
    }
  });

  res.json(updated);
});

router.delete('/roles/:id', (req, res) => {
  const role = getStore().roles.find(r => r.id === req.params.id);
  if (!role) return res.status(404).json({ error: 'Role not found' });

  mutateStore(s => {
    s.roles = s.roles.filter(r => r.id !== req.params.id);
    for (const agent of s.agents) {
      if (agent.roleIds) {
        agent.roleIds = agent.roleIds.filter(rid => rid !== req.params.id);
      }
    }
  });

  res.json({ success: true });
});

router.post('/agents/:id/roles', (req, res) => {
  const agent = getStore().agents.find(a => a.id === req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  const { roleId } = req.body;
  const role = getStore().roles.find(r => r.id === roleId);
  if (!role) return res.status(404).json({ error: 'Role not found' });

  mutateStore(s => {
    const a = s.agents.find(x => x.id === req.params.id);
    if (a) {
      if (!a.roleIds) a.roleIds = [];
      if (!a.roleIds.includes(roleId)) {
        a.roleIds.push(roleId);
      }
    }
  });

  const updated = getStore().agents.find(a => a.id === req.params.id);
  res.json({ roleIds: updated?.roleIds || [] });
});

router.delete('/agents/:id/roles/:roleId', (req, res) => {
  const agent = getStore().agents.find(a => a.id === req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  mutateStore(s => {
    const a = s.agents.find(x => x.id === req.params.id);
    if (a && a.roleIds) {
      a.roleIds = a.roleIds.filter(rid => rid !== req.params.roleId);
    }
  });

  const updated = getStore().agents.find(a => a.id === req.params.id);
  res.json({ roleIds: updated?.roleIds || [] });
});

// --- Crons API ---

router.get('/crons', (req, res) => {
  const workspaceId = req.query.workspaceId as string | undefined;
  res.json(listCronJobs(workspaceId || undefined));
});

router.post('/crons', (req, res) => {
  const { name, description, agentId, workspaceId, schedule, prompt } = req.body;
  if (!name || !agentId || !workspaceId || !schedule || !prompt) {
    return res.status(400).json({ error: 'name, agentId, workspaceId, schedule, and prompt are required' });
  }
  const job = createCronJob({
    name,
    description,
    agentId,
    workspaceId,
    schedule,
    prompt,
    enabled: true,
  });
  res.json(job);
});

router.patch('/crons/:id', (req, res) => {
  const updated = updateCronJob(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Cron job not found' });
  res.json(updated);
});

router.delete('/crons/:id', (req, res) => {
  const deleted = deleteCronJob(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Cron job not found' });
  res.json({ success: true });
});

router.post('/crons/:id/run', async (req, res) => {
  const result = await runCronNow(req.params.id);
  if (!result.success) return res.status(400).json({ error: result.error });
  res.json({ success: true });
});

export default router;
