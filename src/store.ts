import { create } from 'zustand';
import { Agent, Task, Log, Comment, TaskStatus, CompanyTemplate, ApprovalRequest, Workspace, CronJob, AgentMessage, Role, PermissionEntry, PermissionType, EventSubscription, DomainEventType, EventDefinition } from './types';

const API_BASE = '/api';

async function apiGet(path: string) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`API GET ${path} failed: ${res.status}`);
  return res.json();
}

async function apiPost(path: string, body: any) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`API POST ${path} failed: ${res.status}`);
  return res.json();
}

async function apiPatch(path: string, body: any) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`API PATCH ${path} failed: ${res.status}`);
  return res.json();
}

async function apiDelete(path: string) {
  const res = await fetch(`${API_BASE}${path}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`API DELETE ${path} failed: ${res.status}`);
  return res.json();
}

interface AppState {
  agents: Agent[];
  workspaces: Workspace[];
  tasks: Task[];
  logs: Log[];
  approvals: ApprovalRequest[];
  crons: CronJob[];
  messages: AgentMessage[];
  roles: Role[];
  subscriptions: EventSubscription[];
  eventDefinitions: EventDefinition[];
  totalCost: number;
  loading: boolean;

  fetchState: () => Promise<void>;
  addAgent: (agent: Omit<Agent, 'id'> & { soul?: string; identity?: string; roleDoc?: string }) => Promise<void>;
  updateAgent: (id: string, agent: Partial<Agent>) => Promise<void>;
  removeAgent: (id: string) => Promise<void>;

  addWorkspace: (workspace: Omit<Workspace, 'id' | 'agentIds' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateWorkspace: (id: string, workspace: Partial<Workspace>) => Promise<void>;
  removeWorkspace: (id: string) => Promise<void>;
  assignAgentToWorkspace: (agentId: string, workspaceId: string | undefined) => Promise<void>;

  addTask: (task: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'comments' | 'subtasks' | 'cost'>) => Promise<void>;
  updateTask: (id: string, task: Partial<Task>) => Promise<void>;
  updateSubtask: (taskId: string, subtaskId: string, completed: boolean) => Promise<void>;
  moveTask: (id: string, status: TaskStatus) => Promise<void>;
  addComment: (taskId: string, comment: Omit<Comment, 'id' | 'createdAt'>) => Promise<void>;

  addLog: (log: Omit<Log, 'id' | 'timestamp'>) => Promise<void>;
  addApproval: (approval: Omit<ApprovalRequest, 'id' | 'createdAt' | 'status'>) => Promise<void>;
  resolveApproval: (id: string, approved: boolean) => Promise<void>;

  applyTemplate: (template: CompanyTemplate, workspaceId: string) => Promise<void>;
  initWorkspaceFromYml: (folderPath: string) => Promise<void>;

  fetchCrons: (workspaceId?: string) => Promise<void>;
  addCron: (cron: Omit<CronJob, 'id' | 'createdAt'>) => Promise<void>;
  updateCron: (id: string, updates: Partial<CronJob>) => Promise<void>;
  removeCron: (id: string) => Promise<void>;
  runCron: (id: string) => Promise<void>;

  createRole: (role: { name: string; description?: string; workspaceId: string }) => Promise<Role>;
  deleteRole: (roleId: string) => Promise<void>;
  updateRole: (roleId: string, updates: Partial<Role>) => Promise<void>;
  assignRole: (agentId: string, roleId: string) => Promise<void>;
  revokeRole: (agentId: string, roleId: string) => Promise<void>;
  grantPermissionToAgent: (agentId: string, type: PermissionType, scope?: string[]) => Promise<void>;
  revokePermissionFromAgent: (agentId: string, type: PermissionType) => Promise<void>;
  sendMessageToAgent: (agentId: string, content: string) => Promise<void>;
  createSubscription: (subscription: Omit<EventSubscription, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateSubscription: (id: string, updates: Partial<Pick<EventSubscription, 'enabled' | 'channel' | 'instructions'>> & { filters?: Partial<EventSubscription['filters']> }) => Promise<void>;
  deleteSubscription: (id: string) => Promise<void>;
}

export const useStore = create<AppState>((set, get) => ({
  agents: [],
  workspaces: [],
  tasks: [],
  logs: [],
  approvals: [],
  crons: [],
  messages: [],
  roles: [],
  subscriptions: [],
  eventDefinitions: [],
  totalCost: 0,
  loading: true,

  fetchState: async () => {
    try {
      const state = await apiGet('/state');
      set({ ...state, loading: false });
    } catch (e) {
      console.error('Failed to fetch state:', e);
      set({ loading: false });
    }
  },

  addAgent: async (agent) => {
    const newAgent = await apiPost('/agents', agent);
    set({ agents: [...get().agents, newAgent] });
  },

  updateAgent: async (id, updates) => {
    const updated = await apiPatch(`/agents/${id}`, updates);
    set({ agents: get().agents.map(a => a.id === id ? updated : a) });
  },

  removeAgent: async (id) => {
    await apiDelete(`/agents/${id}`);
    set({ agents: get().agents.filter(a => a.id !== id) });
  },

  addWorkspace: async (workspace) => {
    const newWorkspace = await apiPost('/workspaces', workspace);
    set({ workspaces: [...get().workspaces, newWorkspace] });
  },

  updateWorkspace: async (id, updates) => {
    const updated = await apiPatch(`/workspaces/${id}`, updates);
    set({ workspaces: get().workspaces.map(w => w.id === id ? updated : w) });
  },

  removeWorkspace: async (id) => {
    await apiDelete(`/workspaces/${id}`);
    set({ workspaces: get().workspaces.filter(w => w.id !== id) });
  },

  assignAgentToWorkspace: async (agentId, workspaceId) => {
    await apiPatch(`/agents/${agentId}`, { workspaceId });
    const agent = get().agents.find(a => a.id === agentId);
    if (!agent) return;
    const oldWorkspaceId = agent.workspaceId;
    if (oldWorkspaceId) {
      set({
        agents: get().agents.map(a => a.id === agentId ? { ...a, workspaceId } : a),
        workspaces: get().workspaces.map(w =>
          w.id === oldWorkspaceId ? { ...w, agentIds: w.agentIds.filter(id => id !== agentId) } : w
        )
      });
    } else if (workspaceId) {
      set({
        agents: get().agents.map(a => a.id === agentId ? { ...a, workspaceId } : a),
        workspaces: get().workspaces.map(w =>
          w.id === workspaceId ? { ...w, agentIds: [...w.agentIds, agentId] } : w
        )
      });
    } else {
      set({ agents: get().agents.map(a => a.id === agentId ? { ...a, workspaceId } : a) });
    }
  },

  addTask: async (task) => {
    const newTask = await apiPost('/tasks', task);
    set({ tasks: [...get().tasks, newTask] });
  },

  updateTask: async (id, updates) => {
    const updated = await apiPatch(`/tasks/${id}`, updates);
    set({ tasks: get().tasks.map(t => t.id === id ? updated : t) });
  },

  updateSubtask: async (taskId, subtaskId, completed) => {
    const task = get().tasks.find(t => t.id === taskId);
    if (!task) return;
    const subtasks = task.subtasks.map(s => s.id === subtaskId ? { ...s, completed } : s);
    const updated = await apiPatch(`/tasks/${taskId}`, { subtasks });
    set({ tasks: get().tasks.map(t => t.id === taskId ? updated : t) });
  },

  moveTask: async (id, status) => {
    const updated = await apiPatch(`/tasks/${id}`, { status });
    set({ tasks: get().tasks.map(t => t.id === id ? updated : t) });
  },

  addComment: async (taskId, comment) => {
    const updated = await apiPost(`/tasks/${taskId}/comments`, comment);
    set({ tasks: get().tasks.map(t => t.id === taskId ? updated : t) });
  },

  addLog: async (log) => {
    const newLog = await apiPost('/logs', log);
    set({ logs: [newLog, ...get().logs].slice(0, 100) });
  },

  addApproval: async (approval) => {
    const newApproval = await apiPost('/approvals', approval);
    set({ approvals: [newApproval, ...get().approvals] });
  },

  resolveApproval: async (id, approved) => {
    const result = await apiPost(`/approvals/${id}/resolve`, { approved });
    set({
      approvals: get().approvals.map(a => a.id === id ? result.approval : a),
      tasks: result.tasks,
      agents: result.agents
    });
  },

  applyTemplate: async (template, workspaceId) => {
    const result = await apiPost('/templates/apply', { ...template, workspaceId });
    set({
      agents: result.agents,
      tasks: result.tasks,
      logs: result.logs
    });
  },

  initWorkspaceFromYml: async (folderPath) => {
    const result = await apiPost('/workspaces/init', { folderPath });
    set({
      agents: result.agents,
      workspaces: result.workspaces,
      tasks: result.tasks,
      logs: result.logs
    });
  },

  fetchCrons: async (workspaceId?) => {
    const query = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : '';
    const crons = await apiGet(`/crons${query}`);
    set({ crons });
  },

  addCron: async (cron) => {
    const newCron = await apiPost('/crons', cron);
    set({ crons: [...get().crons, newCron] });
  },

  updateCron: async (id, updates) => {
    const updated = await apiPatch(`/crons/${id}`, updates);
    set({ crons: get().crons.map(c => c.id === id ? updated : c) });
  },

  removeCron: async (id) => {
    await apiDelete(`/crons/${id}`);
    set({ crons: get().crons.filter(c => c.id !== id) });
  },

  runCron: async (id) => {
    await apiPost(`/crons/${id}/run`, {});
    const crons = await apiGet('/crons');
    set({ crons });
  },

  createRole: async (role) => {
    const newRole = await apiPost('/roles', role);
    set({ roles: [...get().roles, newRole] });
    return newRole;
  },

  deleteRole: async (roleId) => {
    await apiDelete(`/roles/${roleId}`);
    set({ roles: get().roles.filter(r => r.id !== roleId) });
  },

  updateRole: async (roleId, updates) => {
    const updated = await apiPatch(`/roles/${roleId}`, updates);
    set({ roles: get().roles.map(r => r.id === roleId ? updated : r) });
  },

  assignRole: async (agentId, roleId) => {
    const result = await apiPost(`/agents/${agentId}/roles`, { roleId });
    set({
      agents: get().agents.map(a => a.id === agentId ? { ...a, roleIds: result.roleIds } : a),
    });
  },

  revokeRole: async (agentId, roleId) => {
    const result = await apiDelete(`/agents/${agentId}/roles/${roleId}`);
    set({
      agents: get().agents.map(a => a.id === agentId ? { ...a, roleIds: result.roleIds } : a),
    });
  },

  grantPermissionToAgent: async (agentId, type, scope) => {
    const result = await apiPost(`/agents/${agentId}/permissions`, { type, scope });
    set({
      agents: get().agents.map(a => a.id === agentId ? { ...a, permissions: result.permissions } : a),
    });
  },

  revokePermissionFromAgent: async (agentId, type) => {
    const result = await apiDelete(`/agents/${agentId}/permissions/${type}`);
    set({
      agents: get().agents.map(a => a.id === agentId ? { ...a, permissions: result.permissions } : a),
    });
  },

  sendMessageToAgent: async (agentId, content) => {
    const result = await apiPost('/messages/send', { agentId, content });
    set({ messages: [...get().messages, result.message] });
  },

  createSubscription: async (subscription) => {
    await apiPost('/subscriptions', subscription);
    const refreshed = await apiGet('/state');
    set({ subscriptions: refreshed.subscriptions || [] });
  },

  updateSubscription: async (id, updates) => {
    const current = get().subscriptions.find(s => s.id === id);
    if (!current) return;
    await apiPatch(`/subscriptions/${id}`, updates);
    const refreshed = await apiGet('/state');
    set({ subscriptions: refreshed.subscriptions || [] });
  },

  deleteSubscription: async (id) => {
    await apiDelete(`/subscriptions/${id}`);
    set({ subscriptions: get().subscriptions.filter(s => s.id !== id) });
  }
}));

export interface ChatThread {
  chatId: string;
  kind: 'agent-thread' | 'admin-thread';
  agents: [Agent | null, Agent | null];
  workspaceId: string;
  workspaceName: string;
  messages: AgentMessage[];
  lastMessage: AgentMessage;
  lastMessageTime: string;
  waitingReply: boolean;
}

function makeChatId(aId: string, bId: string): string {
  return [aId, bId].sort().join('::');
}

export function useAgentChats(): ChatThread[] {
  const messages = useStore(s => s.messages);
  const agents = useStore(s => s.agents);
  const workspaces = useStore(s => s.workspaces);

  if (!messages || messages.length === 0) return [];

  const agentMap = new Map(agents.map(a => [a.id, a]));
  const workspaceMap = new Map(workspaces.map(w => [w.id, w]));

  const threadMap = new Map<string, AgentMessage[]>();

  for (const msg of messages) {
    if (!msg.fromAgentId || !msg.toAgentId) continue;
    const cId = makeChatId(msg.fromAgentId, msg.toAgentId);
    const existing = threadMap.get(cId) || [];
    existing.push(msg);
    threadMap.set(cId, existing);
  }

  const threads: ChatThread[] = [];

  for (const [chatId, msgs] of threadMap) {
    const [idA, idB] = chatId.split('::');
    const agentA = agentMap.get(idA);
    const agentB = agentMap.get(idB);
    const fromUser = idA === 'user' || idB === 'user';
    if (!agentA && !agentB) continue;

    const sorted = msgs.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const lastMessage = sorted[sorted.length - 1];

    const ws = agentA?.workspaceId
      ? workspaceMap.get(agentA.workspaceId)
      : agentB?.workspaceId
        ? workspaceMap.get(agentB.workspaceId)
        : undefined;

    threads.push({
      chatId,
      kind: fromUser ? 'admin-thread' : 'agent-thread',
      agents: [agentA || null, agentB || null],
      workspaceId: ws?.id || 'orphans',
      workspaceName: ws?.name || 'No Workspace',
      messages: sorted,
      lastMessage,
      lastMessageTime: lastMessage.createdAt.slice(11, 16),
      waitingReply: !fromUser && lastMessage.status === 'pending' && lastMessage.toAgentId !== lastMessage.fromAgentId,
    });
  }

  threads.sort((a, b) => b.lastMessage.createdAt.localeCompare(a.lastMessage.createdAt));
  return threads;
}
