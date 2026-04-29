import { Router } from 'express';
import { listCronJobs, createCronJob, updateCronJob, deleteCronJob, runCronNow } from '../cron';

const router = Router();

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
