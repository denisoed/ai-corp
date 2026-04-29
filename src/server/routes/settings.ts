import { Router } from 'express';
import { getSettings, updateSettings } from '../lib/settings';
import { launchSearXng, checkSearXngStatus } from '../lib/searxng';
import { testProvider, listProviderModels, getAllProviderDefs, getProviderDef } from '../llm';
import type { LLMProvider } from '../../types';

const router = Router();

router.get('/settings', (_req, res) => {
  const settings = getSettings();
  const safeSettings = {
    ...settings,
    providers: Object.fromEntries(
      Object.entries(settings.providers || {}).map(([id, p]) => [
        id,
        { ...p, apiKey: p.apiKey ? '***' + p.apiKey.slice(-4) : '' },
      ])
    ),
  };
  res.json(safeSettings);
});

router.put('/settings', (req, res) => {
  const settings = getSettings();
  const newProviders = (req.body.providers || {}) as Record<string, Partial<LLMProvider>>;

  const mergedProviders = { ...settings.providers } as Record<string, LLMProvider>;
  for (const [id, provider] of Object.entries(newProviders)) {
    const existing = settings.providers?.[id];
    if (existing && provider.apiKey && provider.apiKey.startsWith('***')) {
      mergedProviders[id] = { ...existing, ...provider, apiKey: existing.apiKey };
    } else if (provider.id && provider.name) {
      mergedProviders[id] = provider as LLMProvider;
    }
  }

  const updated = updateSettings({
    ...req.body,
    providers: mergedProviders,
  });
  res.json(updated);
});

router.get('/settings/providers/defs', (_req, res) => {
  res.json(getAllProviderDefs());
});

router.get('/settings/providers/defs/:id', (req, res) => {
  const def = getProviderDef(req.params.id);
  if (!def) {
    return res.status(404).json({ error: 'Provider not found' });
  }
  res.json(def);
});

router.post('/settings/providers/:id/test', async (req, res) => {
  try {
    const success = await testProvider(req.params.id);
    res.json({ success });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/settings/providers/:id/models', async (req, res) => {
  try {
    const models = await listProviderModels(req.params.id);
    res.json({ models });
  } catch (e: any) {
    res.status(500).json({ models: [], error: e.message });
  }
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