import { Router } from 'express';
import { getStore, mutateStore, getRolesByWorkspace } from '../store';

const router = Router();

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

export default router;
