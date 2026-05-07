import fs from 'fs';
import path from 'path';
import os from 'os';
import { Agent, Task, Log, ApprovalRequest, Workspace, AgentMessage, Role, PermissionEntry, PermissionType, EventSubscription, CommandRun, Pipeline, PipelineInstance } from '../types';
import { matchesGlob } from './lib/glob';
import {
  getDb, loadCollection, saveCollection,
  loadSetting, saveSetting, loadAllSettings
} from './db';

const DATA_DIR = path.join(os.homedir(), '.aicorp');
const WORKSPACES_DIR = path.join(DATA_DIR, 'workspaces');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const WORKSPACES_LIST_FILE = path.join(DATA_DIR, 'workspaces.json');
const GLOBAL_DIR = path.join(DATA_DIR, 'workspace');
const OLD_STORE_FILE = path.join(DATA_DIR, 'store.json');

export interface StoreData {
  agents: Agent[];
  workspaces: Workspace[];
  tasks: Task[];
  logs: Log[];
  approvals: ApprovalRequest[];
  messages: AgentMessage[];
  roles: Role[];
  subscriptions: EventSubscription[];
  commandRuns: CommandRun[];
  pipelines: Pipeline[];
  pipelineInstances: PipelineInstance[];
  totalCost: number;
}

interface WorkspaceData {
  agents: Agent[];
  tasks: Task[];
  logs: Log[];
  approvals: ApprovalRequest[];
  messages: AgentMessage[];
  roles: Role[];
  subscriptions: EventSubscription[];
  commandRuns: CommandRun[];
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
      type: 'info',
      source: 'system',
      category: 'system',
    }
  ],
  approvals: [],
  messages: [],
  roles: [],
  subscriptions: [],
  commandRuns: [],
  pipelines: [],
  pipelineInstances: [],
  totalCost: 0
};

function wsDir(slug: string): string {
  return path.join(WORKSPACES_DIR, slug);
}

function wsFile(slug: string, name: string): string {
  return path.join(wsDir(slug), name);
}

function loadFromJsonFiles(): StoreData {
  try {
    const settings = readJson<{ totalCost: number }>(SETTINGS_FILE, { totalCost: 0 });
    let workspaces = readJson<Workspace[]>(WORKSPACES_LIST_FILE, []);

    const allAgents: Agent[] = readJson(path.join(GLOBAL_DIR, 'agents.json'), []);
    const allTasks: Task[] = readJson(path.join(GLOBAL_DIR, 'tasks.json'), []);
    const allLogs: Log[] = readJson(path.join(GLOBAL_DIR, 'logs.json'), []);
    const allApprovals: ApprovalRequest[] = readJson(path.join(GLOBAL_DIR, 'approvals.json'), []);
    const allMessages: AgentMessage[] = readJson(path.join(GLOBAL_DIR, 'messages.json'), []);
    const allRoles: Role[] = readJson(path.join(GLOBAL_DIR, 'roles.json'), []);
    const allSubscriptions: EventSubscription[] = readJson(path.join(GLOBAL_DIR, 'subscriptions.json'), []);
    const allCommandRuns: CommandRun[] = readJson(path.join(GLOBAL_DIR, 'command-runs.json'), []);

    for (const ws of workspaces) {
      allAgents.push(...readJson<Agent[]>(wsFile(ws.slug, 'agents.json'), []));
      allTasks.push(...readJson<Task[]>(wsFile(ws.slug, 'tasks.json'), []));
      allLogs.push(...readJson<Log[]>(wsFile(ws.slug, 'logs.json'), []));
      allApprovals.push(...readJson<ApprovalRequest[]>(wsFile(ws.slug, 'approvals.json'), []));
      allMessages.push(...readJson<AgentMessage[]>(wsFile(ws.slug, 'messages.json'), []));
      allRoles.push(...readJson<Role[]>(wsFile(ws.slug, 'roles.json'), []));
      allSubscriptions.push(...readJson<EventSubscription[]>(wsFile(ws.slug, 'subscriptions.json'), []));
    }

    return {
      agents: allAgents,
      workspaces,
      tasks: allTasks,
      logs: allLogs,
      approvals: allApprovals,
      messages: allMessages,
      roles: allRoles,
      subscriptions: allSubscriptions,
      commandRuns: allCommandRuns,
      pipelines: [],
      pipelineInstances: [],
      totalCost: settings.totalCost
    };
  } catch (e) {
    console.error('[Store] Failed to load from JSON files:', e);
    return {
      agents: [], workspaces: [], tasks: [], logs: [], approvals: [],
      messages: [], roles: [], subscriptions: [], commandRuns: [],
      pipelines: [], pipelineInstances: [], totalCost: 0
    };
  }
}

function loadFromSqlite(): StoreData {
  const costStr = loadSetting('totalCost');
  return {
    agents: loadCollection<Agent>('agents'),
    workspaces: loadCollection<Workspace>('workspaces'),
    tasks: loadCollection<Task>('tasks'),
    logs: loadCollection<Log>('logs'),
    approvals: loadCollection<ApprovalRequest>('approvals'),
    messages: loadCollection<AgentMessage>('messages'),
    roles: loadCollection<Role>('roles'),
    subscriptions: loadCollection<EventSubscription>('subscriptions'),
    commandRuns: loadCollection<CommandRun>('command_runs'),
    pipelines: loadCollection<Pipeline>('pipelines'),
    pipelineInstances: loadCollection<PipelineInstance>('pipeline_instances'),
    totalCost: costStr ? parseFloat(costStr) : 0,
  };
}

function migrateJsonToSqlite(data: StoreData): void {
  console.log('[Store] Migrating JSON data to SQLite...');

  saveSetting('totalCost', String(data.totalCost));

  saveCollection('workspaces', data.workspaces, (w) => w.id);
  saveCollection('agents', data.agents, (a) => a.workspaceId || '');
  saveCollection('tasks', data.tasks, (t) => '');
  saveCollection('logs', data.logs, (l) => l.workspaceId || '');
  saveCollection('approvals', data.approvals, (a) => '');
  saveCollection('messages', data.messages, (m) => '');
  saveCollection('roles', data.roles, (r) => r.workspaceId || '');
  saveCollection('subscriptions', data.subscriptions, (s) => '');
  saveCollection('command_runs', data.commandRuns, (c) => c.workspaceId || '');
  saveCollection('pipelines', data.pipelines, (p) => p.workspaceId || '');
  saveCollection('pipeline_instances', data.pipelineInstances, (pi) => '');

  console.log('[Store] Migration to SQLite complete');
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

export function loadStore() {
  try {
    // Initialize SQLite database
    getDb();

    // Check if SQLite has data
    const existingWorkspaces = loadCollection<Workspace>('workspaces');
    if (existingWorkspaces.length > 0) {
      store = loadFromSqlite();

      // Apply orphan migration (in-memory only)
      const orphanAgents = store.agents.filter(a => !a.workspaceId);
      if (orphanAgents.length > 0) {
        applyOrphanMigration();
      }

      console.log('[Store] Loaded from SQLite');
      return;
    }

    // Check if JSON data exists (old format)
    if (fs.existsSync(SETTINGS_FILE)) {
      const jsonData = loadFromJsonFiles();

      if (jsonData.workspaces.length > 0 || jsonData.agents.length > 0) {
        migrateJsonToSqlite(jsonData);
        store = jsonData;
        applyOrphanMigration();
        console.log('[Store] Loaded from JSON files and migrated to SQLite');
        return;
      }
    }

    // Try legacy store.json
    if (fs.existsSync(OLD_STORE_FILE)) {
      const old = readJson<StoreData>(OLD_STORE_FILE, store);

      if (fs.existsSync(WORKSPACES_LIST_FILE) || fs.existsSync(path.join(GLOBAL_DIR, 'agents.json'))) {
        const merged = loadFromJsonFiles();
        migrateJsonToSqlite(merged);
        store = merged;
        applyOrphanMigration();
      } else {
        store = {
          agents: old.agents || [],
          workspaces: old.workspaces || [],
          tasks: old.tasks || [],
          logs: old.logs || [],
          approvals: old.approvals || [],
          messages: old.messages || [],
          roles: (old as any).roles || [],
          subscriptions: (old as any).subscriptions || [],
          commandRuns: (old as any).commandRuns || [],
          pipelines: [],
          pipelineInstances: [],
          totalCost: old.totalCost ?? 0,
        };
        applyOrphanMigration();
        migrateJsonToSqlite(store);
      }

      try {
        const bakFile = OLD_STORE_FILE + '.bak';
        if (fs.existsSync(bakFile)) fs.unlinkSync(bakFile);
        fs.renameSync(OLD_STORE_FILE, bakFile);
      } catch (_) {}

      console.log('[Store] Loaded from legacy store.json and migrated to SQLite');
      return;
    }

    // No data files exist at all — start fresh
    saveStore();
    console.log('[Store] No existing data found, starting fresh with SQLite');
  } catch (e) {
    console.error('[Store] Failed to load:', e);
    // Fall back to JSON loading if SQLite fails
    try {
      store = loadFromJsonFiles();
    } catch (e2) {
      console.error('[Store] JSON fallback also failed:', e2);
    }
  }
}

export function saveStore() {
  try {
    const d = getDb();

    const transaction = d.transaction(() => {
      saveSetting('totalCost', String(store.totalCost));

      saveCollection('workspaces', store.workspaces, (w) => w.id || '');
      saveCollection('agents', store.agents, (a) => a.workspaceId || '');
      saveCollection('tasks', store.tasks, () => '');
      saveCollection('logs', store.logs, (l) => l.workspaceId || '');
      saveCollection('approvals', store.approvals, () => '');
      saveCollection('messages', store.messages, () => '');
      saveCollection('roles', store.roles, (r) => r.workspaceId || '');
      saveCollection('subscriptions', store.subscriptions, () => '');
      saveCollection('command_runs', store.commandRuns, (c) => c.workspaceId || '');
      saveCollection('pipelines', store.pipelines, (p) => p.workspaceId || '');
      saveCollection('pipeline_instances', store.pipelineInstances, () => '');
    });

    transaction();
  } catch (e) {
    console.error('[Store] Failed to save to SQLite:', e);
  }
}

export function getStore(): Readonly<StoreData> {
  return store;
}

export function mutateStore(updater: (draft: StoreData) => void) {
  updater(store);
  saveStore();
}

export function agentsAreConnected(aId: string, bId: string, agents: Agent[]): boolean {
  if (aId === bId) return true;
  const a = agents.find(x => x.id === aId);
  const b = agents.find(x => x.id === bId);
  if (!a || !b) return false;
  if (a.parentId === bId || b.parentId === aId) return true;
  if (a.collaborators?.includes(bId) || b.collaborators?.includes(aId)) return true;
  return false;
}

export function addConnectionToStore(s: StoreData, aId: string, bId: string, connectionType: string): boolean {
  if (aId === bId) return false;
  if (!['manager', 'subordinate', 'collaborator'].includes(connectionType)) return false;

  const a = s.agents.find(x => x.id === aId);
  const b = s.agents.find(x => x.id === bId);
  if (!a || !b) return false;

  if (connectionType === 'manager') {
    b.parentId = aId;
  } else if (connectionType === 'subordinate') {
    a.parentId = bId;
  } else if (connectionType === 'collaborator') {
    if (!a.collaborators) a.collaborators = [];
    if (!b.collaborators) b.collaborators = [];
    if (!a.collaborators.includes(bId)) a.collaborators.push(bId);
    if (!b.collaborators.includes(aId)) b.collaborators.push(aId);
  }
  return true;
}

export function removeConnectionFromStore(s: StoreData, aId: string, bId: string): boolean {
  const a = s.agents.find(x => x.id === aId);
  const b = s.agents.find(x => x.id === bId);
  if (!a || !b) return false;

  let removed = false;

  if (a.parentId === bId) { a.parentId = undefined; removed = true; }
  if (b.parentId === aId) { b.parentId = undefined; removed = true; }

  if (a.collaborators) {
    const idx = a.collaborators.indexOf(bId);
    if (idx !== -1) { a.collaborators.splice(idx, 1); removed = true; }
  }
  if (b.collaborators) {
    const idx = b.collaborators.indexOf(aId);
    if (idx !== -1) { b.collaborators.splice(idx, 1); removed = true; }
  }

  return removed;
}

export function updateConnectionInStore(s: StoreData, aId: string, bId: string, connectionType: string): boolean {
  if (aId === bId) return false;
  if (!['manager', 'subordinate', 'collaborator', 'none'].includes(connectionType)) return false;

  removeConnectionFromStore(s, aId, bId);

  if (connectionType === 'none') return true;

  return addConnectionToStore(s, aId, bId, connectionType);
}

export function getEffectivePermissions(agentId: string): PermissionEntry[] {
  const agent = store.agents.find(a => a.id === agentId);
  if (!agent) return [];

  const roleIds = agent.roleIds || [];
  const effective: PermissionEntry[] = [];

  for (const roleId of roleIds) {
    const role = store.roles.find(r => r.id === roleId);
    if (role) {
      effective.push(...role.permissions);
    }
  }

  if (agent.permissions) {
    effective.push(...agent.permissions);
  }

  return effective;
}

export function hasPermission(agentId: string, permissionType: PermissionType, filePath?: string): boolean {
  const agent = store.agents.find(a => a.id === agentId);
  if (!agent) return false;

  const permissions = getEffectivePermissions(agentId);

  for (const perm of permissions) {
    if (perm.type !== permissionType) continue;

    if (perm.scope === 'all') return true;

    if (Array.isArray(perm.scope) && filePath) {
      const normalizedPath = filePath.replace(/\\/g, '/').replace(/^\/+/, '');
      for (const pattern of perm.scope) {
        if (matchesGlob(normalizedPath, pattern)) return true;
      }
    }
  }

  return false;
}

export function ensureDefaultRoles(workspaceId: string): void {
  const existing = store.roles.filter(r => r.workspaceId === workspaceId);
  const now = new Date().toISOString();

  if (!existing.find(r => r.name === 'reader')) {
    store.roles.push({
      id: crypto.randomUUID(),
      workspaceId,
      name: 'reader',
      description: 'Read-only access to workspace files',
      permissions: [
        { type: 'file:read', scope: 'all' },
        { type: 'file:list', scope: 'all' },
        { type: 'system:web_search', scope: 'all' },
        { type: 'system:fetch_url', scope: 'all' },
      ],
      createdAt: now,
      updatedAt: now,
    });
  }

  if (!existing.find(r => r.name === 'developer')) {
    store.roles.push({
      id: crypto.randomUUID(),
      workspaceId,
      name: 'developer',
      description: 'Read/write access to workspace files',
      permissions: [
        { type: 'file:read', scope: 'all' },
        { type: 'file:write', scope: 'all' },
        { type: 'file:delete', scope: 'all' },
        { type: 'file:list', scope: 'all' },
      ],
      createdAt: now,
      updatedAt: now,
    });
  }

  if (!existing.find(r => r.name === 'admin')) {
    store.roles.push({
      id: crypto.randomUUID(),
      workspaceId,
      name: 'admin',
      description: 'Full administrative access — manage agents, roles, permissions, crons, and files',
      permissions: [
        { type: 'file:read', scope: 'all' },
        { type: 'file:write', scope: 'all' },
        { type: 'file:delete', scope: 'all' },
        { type: 'file:list', scope: 'all' },
        { type: 'system:manage_agents', scope: 'all' },
        { type: 'system:manage_permissions', scope: 'all' },
        { type: 'system:manage_roles', scope: 'all' },
        { type: 'system:manage_crons', scope: 'all' },
        { type: 'system:manage_skills', scope: 'all' },
        { type: 'system:broadcast', scope: 'all' },
        { type: 'system:web_search', scope: 'all' },
        { type: 'system:fetch_url', scope: 'all' },
        { type: 'system:http_request', scope: 'all' },
      ],
      createdAt: now,
      updatedAt: now,
    });
  }

  if (existing.length !== store.roles.filter(r => r.workspaceId === workspaceId).length) {
    saveStore();
  }
}

export function getRolesByWorkspace(workspaceId: string): Role[] {
  return store.roles.filter(r => r.workspaceId === workspaceId);
}

export function assignDefaultRole(agentId: string): void {
  const agent = store.agents.find(a => a.id === agentId);
  if (!agent) return;

  const workspaceRoles = store.roles.filter(r => r.workspaceId === agent.workspaceId);
  const readerRole = workspaceRoles.find(r => r.name === 'reader');

  if (readerRole) {
    if (!agent.roleIds) agent.roleIds = [];
    if (!agent.roleIds.includes(readerRole.id)) {
      agent.roleIds.push(readerRole.id);
    }
  }
}
