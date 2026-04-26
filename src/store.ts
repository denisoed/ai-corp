import { create } from 'zustand';
import { Agent, Task, Log, Comment, TaskStatus, CompanyTemplate, ApprovalRequest, Workspace } from './types';

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
  isAutopilot: boolean;
  totalCost: number;
  loading: boolean;

  fetchState: () => Promise<void>;
  addAgent: (agent: Omit<Agent, 'id'>) => Promise<void>;
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

  applyTemplate: (template: CompanyTemplate) => Promise<void>;
  toggleAutopilot: () => Promise<void>;
}

export const useStore = create<AppState>((set, get) => ({
  agents: [],
  workspaces: [],
  tasks: [],
  logs: [],
  approvals: [],
  isAutopilot: false,
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

  applyTemplate: async (template) => {
    const result = await apiPost('/templates/apply', template);
    set({
      agents: result.agents,
      tasks: result.tasks,
      logs: result.logs,
      isAutopilot: result.isAutopilot
    });
  },

  toggleAutopilot: async () => {
    const result = await apiPost('/autopilot/toggle', {});
    set({
      isAutopilot: result.isAutopilot,
      logs: [result.log, ...get().logs].slice(0, 100)
    });
  }
}));
