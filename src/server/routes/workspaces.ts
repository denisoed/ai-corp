import { Router } from 'express';
import yaml from 'js-yaml';
import fs from 'fs';
import path from 'path';
import { getStore, mutateStore, ensureDefaultRoles, assignDefaultRole } from '../store';
import { createMemory, writePersonalityFile } from '../agent-memory';
import { WorkspaceDefinition } from '../../types';

const router = Router();

function generateSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

router.post('/workspaces', (req, res) => {
  const folderPath = req.body.folderPath ? path.resolve(req.body.folderPath) : undefined;
  if (folderPath) {
    fs.mkdirSync(folderPath, { recursive: true });
  }
  const workspace = {
    ...req.body,
    folderPath,
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
  const fsMod = await import('fs');
  const pathMod = await import('path');

  function readDir(dir: string): any {
    try {
      const entries = fsMod.readdirSync(dir, { withFileTypes: true });
      const items = [];
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '__pycache__') continue;
        const fullPath = pathMod.join(dir, entry.name);
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

  const resolvedTarget = pathMod.resolve(targetPath);
  if (!pathMod.isAbsolute(targetPath)) {
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

router.post('/workspaces/init', (req, res) => {
  const { folderPath } = req.body;
  if (!folderPath) {
    return res.status(400).json({ error: 'folderPath is required' });
  }

  const resolvedFolderPath = path.resolve(folderPath);
  if (!fs.existsSync(resolvedFolderPath)) {
    fs.mkdirSync(resolvedFolderPath, { recursive: true });
  }

  const ymlPath = path.join(resolvedFolderPath, '.aicorp.yml');
  if (!fs.existsSync(ymlPath)) {
    return res.status(404).json({ error: `.aicorp.yml not found in ${resolvedFolderPath}` });
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
      folderPath: resolvedFolderPath,
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
      details: `Initialized "${def.workspace.slug}" with ${def.agents?.length || 0} agents from ${resolvedFolderPath}`,
      type: 'success',
      source: 'system',
      category: 'system',
      metadata: { ymlPath: resolvedFolderPath, agentCount: def.agents?.length || 0, templateName: def.workspace.slug },
    });
    if (s.logs.length > 100) s.logs = s.logs.slice(0, 100);
  });

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
      type: 'success',
      source: 'system',
      category: 'system',
      metadata: { templateName: template.name, agentCount: newAgentIds.length },
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
      assignDefaultRole(agent.id);
      const tmpl = template.agents[i];
      if (tmpl?.soul) writePersonalityFile(agent.id, 'SOUL.md', tmpl.soul);
      if (tmpl?.identity) writePersonalityFile(agent.id, 'IDENTITY.md', tmpl.identity);
      if (tmpl?.role_doc) writePersonalityFile(agent.id, 'ROLE.md', tmpl.role_doc);
    }
  }

  res.json(getStore());
});

export default router;
