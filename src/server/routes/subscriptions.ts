import { Router } from 'express';
import { getStore, mutateStore } from '../store';
import type { EventSubscription } from '../../types';

const router = Router();

router.get('/subscriptions', (req, res) => {
  const agentId = String(req.query.agentId || req.headers['x-agent-id'] || '').trim();
  const store = getStore();
  const subscriptions = agentId
    ? store.subscriptions.filter(sub => sub.agentId === agentId)
    : store.subscriptions;
  res.json({ subscriptions });
});

router.post('/subscriptions', (req, res) => {
  const subscription = req.body as EventSubscription;
  if (!subscription?.agentId || !subscription?.eventType) {
    return res.status(400).json({ error: 'agentId and eventType are required' });
  }

  mutateStore(s => {
    s.subscriptions.unshift({
      ...subscription,
      id: subscription.id || crypto.randomUUID(),
      createdAt: subscription.createdAt || new Date().toISOString(),
      updatedAt: subscription.updatedAt || new Date().toISOString(),
      enabled: subscription.enabled ?? true,
      channel: subscription.channel || 'telegram',
      filters: subscription.filters || {}
    });
  });

  res.json({ success: true });
});

router.delete('/subscriptions/:id', (req, res) => {
  mutateStore(s => {
    s.subscriptions = s.subscriptions.filter(sub => sub.id !== req.params.id);
  });
  res.json({ success: true });
});

router.patch('/subscriptions/:id', (req, res) => {
  let updated: EventSubscription | undefined;
  mutateStore(s => {
    const sub = s.subscriptions.find(item => item.id === req.params.id);
    if (!sub) return;
    Object.assign(sub, req.body, {
      updatedAt: new Date().toISOString(),
      filters: {
        ...sub.filters,
        ...(req.body.filters || {}),
      },
    });
    updated = sub;
  });
  if (!updated) return res.status(404).json({ error: 'Subscription not found' });
  res.json(updated);
});

export default router;
