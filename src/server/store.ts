import fs from 'fs';
import path from 'path';
import os from 'os';
import { Agent, Task, Log, ApprovalRequest, Workspace } from '../types';


const DATA_DIR = path.join(os.homedir(), '.aicorp');
const DATA_FILE = path.join(DATA_DIR, 'store.json');

interface StoreData {
  agents: Agent[];
  workspaces: Workspace[];
  tasks: Task[];
  logs: Log[];
  approvals: ApprovalRequest[];
  isAutopilot: boolean;
  totalCost: number;
}

const defaultStore: StoreData = {
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

let store: StoreData = JSON.parse(JSON.stringify(defaultStore));

export function loadStore() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      store = {
        ...defaultStore,
        ...parsed,
        workspaces: parsed.workspaces || []
      };

      // Migration: legacy agents without workspace get a fallback workspace
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

      console.log('[Store] Loaded from', DATA_FILE);
    } else {
      console.log('[Store] No data file found, using defaults');
      saveStore();
    }
  } catch (e) {
    console.error('[Store] Failed to load:', e);
  }
}

export function saveStore() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
  } catch (e) {
    console.error('[Store] Failed to save:', e);
  }
}

export function getStore(): Readonly<StoreData> {
  return store;
}

export function mutateStore(updater: (draft: StoreData) => void) {
  updater(store);
  saveStore();
}
