import { Router } from 'express';
import { getSettings, updateSettings } from '../lib/settings';
import { launchSearXng, checkSearXngStatus } from '../lib/searxng';

const router = Router();

router.get('/settings', (_req, res) => {
  res.json(getSettings());
});

router.put('/settings', (req, res) => {
  const updated = updateSettings(req.body);
  res.json(updated);
});

router.post('/settings/searxng/launch', async (_req, res) => {
  try {
    const result = await launchSearXng();
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

router.get('/settings/searxng/status', async (_req, res) => {
  try {
    const result = await checkSearXngStatus();
    res.json(result);
  } catch {
    res.json({ running: false, url: '' });
  }
});

export default router;
