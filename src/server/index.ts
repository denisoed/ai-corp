import 'dotenv/config';
import express from 'express';
import path from 'path';
import apiRouter from './api';
import { loadStore } from './store';
import { startTelegramManager } from './telegram';
import { startOrchestrator } from './orchestrator';
import { initMemorySystem } from './agent-memory';
import { initCronManager } from './cron';

const app = express();
const PORT = process.env.PORT || 4000;

// Initialize storage systems
loadStore();
initMemorySystem();

// Start background services
startTelegramManager();
startOrchestrator();
initCronManager();

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
