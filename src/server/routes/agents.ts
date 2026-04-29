import { Router } from 'express';
import { getStore, mutateStore, agentsAreConnected, removeConnectionFromStore, addConnectionToStore, ensureDefaultRoles, assignDefaultRole } from '../store';
import { createMemory, clearMemory, loadMemory, getMemoryContext, readPersonalityFile, writePersonalityFile, getAllPersonalityFiles } from '../agent-memory';
import type { PermissionEntry } from '../../types';

const router = Router();

function generateSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

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

router.post('/agents/:id/permissions', (req, res) => {
  const agent = getStore().agents.find(a => a.id === req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  const { type, scope } = req.body;
  if (!type) return res.status(400).json({ error: 'Permission type is required' });

  const validTypes: string[] = [
    'file:read', 'file:write', 'file:delete', 'file:list',
    'system:manage_agents', 'system:manage_permissions', 'system:manage_roles',
    'system:manage_crons', 'system:broadcast', 'system:web_search', 'system:fetch_url',
  ];
  if (!validTypes.includes(type)) {
    return res.status(400).json({ error: `Invalid permission type: ${type}` });
  }

  mutateStore(s => {
    const a = s.agents.find(x => x.id === req.params.id);
    if (a) {
      if (!a.permissions) a.permissions = [];
      const existing = a.permissions.findIndex(p => p.type === type);
      const entry: PermissionEntry = { type, scope: Array.isArray(scope) ? scope : 'all' };
      if (existing !== -1) {
        a.permissions[existing] = entry;
      } else {
        a.permissions.push(entry);
      }
    }
  });

  const updated = getStore().agents.find(a => a.id === req.params.id);
  res.json({ permissions: updated?.permissions || [] });
});

router.delete('/agents/:id/permissions/:type', (req, res) => {
  const agent = getStore().agents.find(a => a.id === req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  mutateStore(s => {
    const a = s.agents.find(x => x.id === req.params.id);
    if (a && a.permissions) {
      a.permissions = a.permissions.filter(p => p.type !== req.params.type);
    }
  });

  const updated = getStore().agents.find(a => a.id === req.params.id);
  res.json({ permissions: updated?.permissions || [] });
});

export default router;
