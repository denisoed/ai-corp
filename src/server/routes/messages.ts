import { Router } from 'express';
import { mutateStore, getStore } from '../store';
import { appendMessage } from '../agent-memory';

const router = Router();

router.post('/messages/send', async (req, res) => {
  const agentId = String(req.body.agentId || '').trim();
  const content = String(req.body.content || '').trim();

  if (!agentId) {
    return res.status(400).json({ error: 'agentId is required' });
  }

  if (!content) {
    return res.status(400).json({ error: 'content is required' });
  }

  const state = getStore();
  const targetAgent = state.agents.find(a => a.id === agentId);
  if (!targetAgent) {
    return res.status(404).json({ error: 'Agent not found' });
  }

  const now = new Date().toISOString();
  const message = {
    id: crypto.randomUUID(),
    fromAgentId: 'user',
    toAgentId: targetAgent.id,
    content,
    status: 'pending' as const,
    createdAt: now,
  };

  mutateStore(s => {
    s.messages.push(message);
  });

  await appendMessage(targetAgent.id, {
    role: 'user',
    content: `[From Workspace UI]: ${content}`,
    source: 'api',
  });

  res.json({ success: true, message });
});

export default router;
