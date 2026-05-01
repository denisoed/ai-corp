import 'dotenv/config';
import express from 'express';
import path from 'path';
import apiRouter from './api';
import { loadStore, getStore, ensureDefaultRoles } from './store';
import { startTelegramManager } from './telegram';
import { initMemorySystem } from './agent-memory';
import { initCronManager } from './cron';
import { getSettings, loadSettings } from './lib/settings';
import { launchSearXng } from './lib/searxng';

const app = express();
const PORT = process.env.PORT || 4000;

// Initialize storage systems
loadStore();
loadSettings();
initMemorySystem();

// Ensure default roles exist in all workspaces
for (const ws of getStore().workspaces) {
  ensureDefaultRoles(ws.id);
}

// Start background services
startTelegramManager();
initCronManager();

void (async () => {
  const settings = getSettings();
  const searxngEnabled = settings.searchEngines?.includes('searxng');
  const hasConfiguredUrl = Boolean(settings.searxngUrl);

  if (!searxngEnabled && !hasConfiguredUrl) {
    return;
  }

  try {
    console.log('[Server] Auto-starting SearXNG...');
    const result = await launchSearXng();
    if (result.status === 'error') {
      console.warn(`[Server] SearXNG auto-start failed: ${result.message}`);
    } else {
      console.log(`[Server] SearXNG auto-start result: ${result.message}`);
    }
  } catch (e: any) {
    console.warn('[Server] SearXNG auto-start error:', e?.message || e);
  }
})();

// Middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});
app.use(express.json());

// API routes
app.use('/api', apiRouter);

// Serve static files from dist
app.use(express.static(path.join(process.cwd(), 'dist')));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'dist', 'index.html'));
});

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[Server] Error:', err.stack || err.message || err);
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

app.listen(PORT, () => {
  console.log(`[Server] Running on port ${PORT}`);
  console.log(`[Server] API: http://localhost:${PORT}/api`);
  console.log(`[Server] App:  http://localhost:${PORT}/`);
});
