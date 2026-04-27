import fs from 'fs';
import path from 'path';
import os from 'os';
import { Agent, Task, Log, ApprovalRequest, Workspace } from '../types';

const DATA_DIR = path.join(os.homedir(), '.aicorp');
const WORKSPACES_DIR = path.join(DATA_DIR, 'workspaces');

const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const WORKSPACES_LIST_FILE = path.join(DATA_DIR, 'workspaces.json');
const GLOBAL_DIR = path.join(DATA_DIR, 'workspace');
const OLD_STORE_FILE = path.join(DATA_DIR, 'store.json');

interface StoreData {
  agents: Agent[];
  workspaces: Workspace[];
  tasks: Task[];
  logs: Log[];
  approvals: ApprovalRequest[];
  isAutopilot: boolean;
  totalCost: number;
}

interface WorkspaceData {
  agents: Agent[];
  tasks: Task[];
  logs: Log[];
  approvals: ApprovalRequest[];
}

function readJson<T>(file: string, fallback: T): T {
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } catch (e) {
    console.error(`[Store] Failed to read ${file}:`, e);
  }
  return fallback;
}

function writeJson(file: string, data: any): void {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error(`[Store] Failed to write ${file}:`, e);
  }
}

let store: StoreData = {
  agents: [],
  workspaces: [],
  tasks: [],
  logs: [
    {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      agentId: 'system',
      action: 'System Initialized',
      details: 'Welcome to AI Company Dashboard. Please select a template to start.',
      type: 'info'
    }
  ],
  approvals: [],
  isAutopilot: false,
  totalCost: 0
};

function wsDir(slug: string): string {
  return path.join(WORKSPACES_DIR, slug);
}

function wsFile(slug: string, name: string): string {
  return path.join(wsDir(slug), name);
}

function applyOrphanMigration() {
  const orphanAgents = store.agents.filter(a => !a.workspaceId);
  if (orphanAgents.length > 0) {
    console.warn(`[Store] Found ${orphanAgents.length} agents without workspace. Creating fallback workspace...`);
    const fallbackWorkspace: Workspace = {
      id: crypto.randomUUID(),
      name: 'Fallback Workspace',
      slug: 'fallback',
      description: 'Auto-created workspace for legacy agents',
      folderPath: process.cwd(),
      agentIds: orphanAgents.map(a => a.id),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    store.workspaces.push(fallbackWorkspace);
    orphanAgents.forEach(a => {
      a.workspaceId = fallbackWorkspace.id;
    });
    saveStore();
  }
}

function partitionStore(): Map<string, WorkspaceData> {
  const buckets = new Map<string, WorkspaceData>();
  const emptyData = (): WorkspaceData => ({ agents: [], tasks: [], logs: [], approvals: [] });

  for (const ws of store.workspaces) {
    buckets.set(ws.id, emptyData());
  }
  buckets.set('_global', emptyData());

  const agentWorkspace = new Map<string, string>();
  for (const a of store.agents) {
    agentWorkspace.set(a.id, a.workspaceId || '_global');
  }

  for (const agent of store.agents) {
    const wsId = agent.workspaceId || '_global';
    const bucket = buckets.get(wsId) || buckets.get('_global')!;
    bucket.agents.push(agent);
  }

  for (const task of store.tasks) {
    const wsId = task.assigneeId ? (agentWorkspace.get(task.assigneeId) || '_global') : '_global';
    const bucket = buckets.get(wsId) || buckets.get('_global')!;
    bucket.tasks.push(task);
  }

  for (const log of store.logs) {
    const wsId = (log.agentId && log.agentId !== 'system')
      ? (agentWorkspace.get(log.agentId) || '_global')
      : '_global';
    const bucket = buckets.get(wsId) || buckets.get('_global')!;
    bucket.logs.push(log);
  }

  for (const approval of store.approvals) {
    const wsId = agentWorkspace.get(approval.agentId) || '_global';
    const bucket = buckets.get(wsId) || buckets.get('_global')!;
    bucket.approvals.push(approval);
  }

  return buckets;
}

export function loadStore() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const settings = readJson<{ isAutopilot: boolean; totalCost: number }>(
        SETTINGS_FILE, { isAutopilot: false, totalCost: 0 }
      );
      let workspaces = readJson<Workspace[]>(WORKSPACES_LIST_FILE, []);

      const allAgents: Agent[] = readJson(path.join(GLOBAL_DIR, 'agents.json'), []);
      const allTasks: Task[] = readJson(path.join(GLOBAL_DIR, 'tasks.json'), []);
      const allLogs: Log[] = readJson(path.join(GLOBAL_DIR, 'logs.json'), []);
      const allApprovals: ApprovalRequest[] = readJson(path.join(GLOBAL_DIR, 'approvals.json'), []);

      for (const ws of workspaces) {
        allAgents.push(...readJson<Agent[]>(wsFile(ws.slug, 'agents.json'), []));
        allTasks.push(...readJson<Task[]>(wsFile(ws.slug, 'tasks.json'), []));
        allLogs.push(...readJson<Log[]>(wsFile(ws.slug, 'logs.json'), []));
        allApprovals.push(...readJson<ApprovalRequest[]>(wsFile(ws.slug, 'approvals.json'), []));
      }

      store = {
        agents: allAgents,
        workspaces,
        tasks: allTasks,
        logs: allLogs,
        approvals: allApprovals,
        isAutopilot: settings.isAutopilot,
        totalCost: settings.totalCost
      };

      applyOrphanMigration();

      console.log('[Store] Loaded from split files');
    } else if (fs.existsSync(OLD_STORE_FILE)) {
      const old = readJson<StoreData>(OLD_STORE_FILE, store);
      store = {
        agents: old.agents || [],
        workspaces: old.workspaces || [],
        tasks: old.tasks || [],
        logs: old.logs || [],
        approvals: old.approvals || [],
        isAutopilot: old.isAutopilot ?? false,
        totalCost: old.totalCost ?? 0
      };

      applyOrphanMigration();
      saveStore();

      try {
        const bakFile = OLD_STORE_FILE + '.bak';
        if (fs.existsSync(bakFile)) fs.unlinkSync(bakFile);
        fs.renameSync(OLD_STORE_FILE, bakFile);
        console.log('[Store] Migrated from store.json → settings.json + workspaces/*/');
      } catch (e) {
        console.warn('[Store] Could not rename old store.json:', e);
      }
    } else {
      console.log('[Store] No data files found, using defaults');
      saveStore();
    }
  } catch (e) {
    console.error('[Store] Failed to load:', e);
  }
}

export function saveStore() {
  writeJson(SETTINGS_FILE, { isAutopilot: store.isAutopilot, totalCost: store.totalCost });
  writeJson(WORKSPACES_LIST_FILE, store.workspaces);

  const buckets = partitionStore();

  const global = buckets.get('_global')!;
  writeJson(path.join(GLOBAL_DIR, 'agents.json'), global.agents);
  writeJson(path.join(GLOBAL_DIR, 'tasks.json'), global.tasks);
  writeJson(path.join(GLOBAL_DIR, 'logs.json'), global.logs);
  writeJson(path.join(GLOBAL_DIR, 'approvals.json'), global.approvals);

  for (const ws of store.workspaces) {
    const data = buckets.get(ws.id);
    if (data) {
      writeJson(wsFile(ws.slug, 'agents.json'), data.agents);
      writeJson(wsFile(ws.slug, 'tasks.json'), data.tasks);
      writeJson(wsFile(ws.slug, 'logs.json'), data.logs);
      writeJson(wsFile(ws.slug, 'approvals.json'), data.approvals);
    }
  }

  const knownSlugs = new Set(store.workspaces.map(w => w.slug));
  const files = ['agents.json', 'tasks.json', 'logs.json', 'approvals.json'];
  try {
    if (fs.existsSync(WORKSPACES_DIR)) {
      for (const entry of fs.readdirSync(WORKSPACES_DIR, { withFileTypes: true })) {
        if (entry.isDirectory() && !knownSlugs.has(entry.name)) {
          for (const f of files) {
            const fp = path.join(WORKSPACES_DIR, entry.name, f);
            if (fs.existsSync(fp)) fs.unlinkSync(fp);
          }
        }
      }
    }
  } catch (_) { /* ignore cleanup errors */ }
}

export function getStore(): Readonly<StoreData> {
  return store;
}

export function mutateStore(updater: (draft: StoreData) => void) {
  updater(store);
  saveStore();
}
