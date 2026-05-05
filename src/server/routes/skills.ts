import { Router } from 'express';
import { fetchSkillsCatalog, addCustomSkill, deleteCustomSkill } from '../lib/skills-catalog';
import { getStore, hasPermission } from '../store';
import type { SkillDefinition } from '../../types';

const router = Router();

router.get('/skills/catalog', async (_req, res) => {
  try {
    const forceRefresh = _req.query.refresh === 'true';
    const catalog = await fetchSkillsCatalog(forceRefresh);
    res.json(catalog);
  } catch (err: any) {
    console.error('[SkillsRoute] Failed to get catalog:', err.message);
    res.status(502).json({ error: 'Failed to fetch skills catalog', details: err.message });
  }
});

router.post('/skills/custom', (req, res) => {
  const executingAgentId = req.headers['x-agent-id'] as string | undefined;
  if (executingAgentId) {
    const agent = getStore().agents.find(a => a.id === executingAgentId);
    if (!agent?.workspaceId) {
      return res.status(403).json({ error: 'Not assigned to a workspace.' });
    }
    if (!hasPermission(executingAgentId, 'system:manage_skills')) {
      return res.status(403).json({ error: 'system:manage_skills permission required.' });
    }
  }

  const { name, description } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }
  if (!description || typeof description !== 'string' || !description.trim()) {
    return res.status(400).json({ error: 'description is required' });
  }

  const skill = addCustomSkill(name.trim(), description.trim());
  res.json(skill);
});

router.delete('/skills/custom/:id', (req, res) => {
  const executingAgentId = req.headers['x-agent-id'] as string | undefined;
  if (executingAgentId) {
    const agent = getStore().agents.find(a => a.id === executingAgentId);
    if (!agent?.workspaceId) {
      return res.status(403).json({ error: 'Not assigned to a workspace.' });
    }
    if (!hasPermission(executingAgentId, 'system:manage_skills')) {
      return res.status(403).json({ error: 'system:manage_skills permission required.' });
    }
  }

  if (!req.params.id || !req.params.id.startsWith('custom/')) {
    return res.status(400).json({ error: 'Only custom skills can be deleted.' });
  }

  const deleted = deleteCustomSkill(req.params.id);
  if (!deleted) {
    return res.status(404).json({ error: 'Custom skill not found' });
  }

  res.json({ success: true });
});

export default router;
