import { Router } from 'express';
import { getStore, mutateStore } from '../store';

const router = Router();

router.get('/state', (req, res) => {
  res.json(getStore());
});

router.post('/logs', (req, res) => {
  const log = { ...req.body, id: crypto.randomUUID(), timestamp: new Date().toISOString() };
  mutateStore(s => {
    s.logs.unshift(log);
    if (s.logs.length > 100) s.logs = s.logs.slice(0, 100);
  });
  res.json(log);
});

export default router;
