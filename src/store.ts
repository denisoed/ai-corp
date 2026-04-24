import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { Agent, Task, Log, Comment, TaskStatus, CompanyTemplate, ApprovalRequest } from './types';

interface AppState {
  agents: Agent[];
  tasks: Task[];
  logs: Log[];
  approvals: ApprovalRequest[];
  isAutopilot: boolean;
  totalCost: number;
  
  addAgent: (agent: Omit<Agent, 'id'>) => void;
  updateAgent: (id: string, agent: Partial<Agent>) => void;
  removeAgent: (id: string) => void;

  addTask: (task: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'comments' | 'subtasks' | 'cost'>) => void;
  updateTask: (id: string, task: Partial<Task>) => void;
  updateSubtask: (taskId: string, subtaskId: string, completed: boolean) => void;
  moveTask: (id: string, status: TaskStatus) => void;
  addComment: (taskId: string, comment: Omit<Comment, 'id' | 'createdAt'>) => void;
  
  addLog: (log: Omit<Log, 'id' | 'timestamp'>) => void;
  addApproval: (approval: Omit<ApprovalRequest, 'id' | 'createdAt' | 'status'>) => void;
  resolveApproval: (id: string, approved: boolean) => void;
  
  applyTemplate: (template: CompanyTemplate) => void;
  toggleAutopilot: () => void;
}

const initialAgents: Agent[] = [];

const initialTasks: Task[] = [];

export const useStore = create<AppState>((set) => ({
  agents: initialAgents,
  tasks: initialTasks,
  approvals: [],
  isAutopilot: false,
  totalCost: 0,
  logs: [
    {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      agentId: 'system',
      action: 'System Initialized',
      details: 'Welcome to AI Company Dashboard. Please select a template to start.',
      type: 'info'
    }
  ],

  addAgent: (agent) => set((state) => {
    const newAgent = { ...agent, id: uuidv4() };
    return { agents: [...state.agents, newAgent] };
  }),
  
  updateAgent: (id, updates) => set((state) => ({
    agents: state.agents.map(a => a.id === id ? { ...a, ...updates } : a)
  })),

  removeAgent: (id) => set((state) => ({
    agents: state.agents.filter(a => a.id !== id)
  })),

  addTask: (task) => set((state) => ({
    tasks: [...state.tasks, {
      ...task,
      id: uuidv4(),
      cost: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      comments: [],
      subtasks: []
    }]
  })),

  updateTask: (id, updates) => set((state) => ({
    tasks: state.tasks.map(t => t.id === id ? { ...t, ...updates, updatedAt: new Date().toISOString() } : t)
  })),

  updateSubtask: (taskId, subtaskId, completed) => set((state) => ({
    tasks: state.tasks.map(t => t.id === taskId ? {
      ...t,
      updatedAt: new Date().toISOString(),
      subtasks: t.subtasks.map(s => s.id === subtaskId ? { ...s, completed } : s)
    } : t)
  })),

  moveTask: (id, status) => set((state) => ({
    tasks: state.tasks.map(t => t.id === id ? { ...t, status, updatedAt: new Date().toISOString() } : t)
  })),

  addComment: (taskId, comment) => set((state) => ({
    tasks: state.tasks.map(t => t.id === taskId ? {
      ...t,
      updatedAt: new Date().toISOString(),
      comments: [...t.comments, { ...comment, id: uuidv4(), createdAt: new Date().toISOString() }]
    } : t)
  })),

  addLog: (log) => set((state) => ({
    logs: [{ ...log, id: uuidv4(), timestamp: new Date().toISOString() }, ...state.logs].slice(0, 100)
  })),

  addApproval: (approval) => set((state) => ({
    approvals: [{
      ...approval,
      id: uuidv4(),
      status: 'pending',
      createdAt: new Date().toISOString()
    }, ...state.approvals]
  })),

  resolveApproval: (id, approved) => set((state) => {
    const approval = state.approvals.find(a => a.id === id);
    if (!approval) return state;

    const newApprovals = state.approvals.map(a => 
      a.id === id ? { ...a, status: approved ? ('approved' as const) : ('rejected' as const) } : a
    );

    let newTasks = state.tasks;
    let newAgents = state.agents;

    if (approval.taskId) {
      const task = state.tasks.find(t => t.id === approval.taskId);
      const fixSubtask = { id: uuidv4(), title: 'Fix issues based on feedback', completed: false };

      newTasks = state.tasks.map(t => {
        if (t.id === approval.taskId) {
           return { 
             ...t, 
             status: approved ? 'Review' : 'In Progress',
             subtasks: approved ? t.subtasks : [...t.subtasks, fixSubtask],
             comments: [...t.comments, {
               id: uuidv4(),
               authorId: 'user',
               authorName: 'Admin (You)',
               content: approved ? `Approval granted for: ${approval.action}. Proceeding.` : 'Approval denied. Please revise according to comments.',
               createdAt: new Date().toISOString(),
               type: 'action'
             }]
           };
        }
        return t;
      });
    }
    
    if (approval.agentId) {
      newAgents = state.agents.map(a =>
        a.id === approval.agentId
          ? { ...a, status: 'Idle' } // unblock the agent
          : a
      );
    }

    return {
      ...state,
      approvals: newApprovals,
      tasks: newTasks,
      agents: newAgents,
      logs: [{
        id: uuidv4(),
        timestamp: new Date().toISOString(),
        agentId: 'user',
        action: approved ? 'Approval Granted' : 'Approval Rejected',
        details: `User ${approved ? 'approved' : 'rejected'} action: ${approval.action}`,
        type: (approved ? 'success' : 'error') as 'success' | 'error'
      }, ...state.logs].slice(0, 100)
    };
  }),
  
  applyTemplate: (template) => set(() => {
    // First pass: generate UUIDs for all agents
    const newAgentIds = template.agents.map(() => uuidv4());

    const newAgents: Agent[] = template.agents.map((a, i) => ({
      ...a,
      id: newAgentIds[i],
      parentId: a.parentIndex !== undefined ? newAgentIds[a.parentIndex] : undefined,
      status: 'Idle'
    }));

    const newTasks: Task[] = template.tasks.map(t => ({
      id: uuidv4(),
      title: t.title,
      description: t.description,
      status: t.status,
      priority: t.priority,
      risk: 'medium',
      cost: 0,
      tags: t.tags,
      assigneeId: t.assigneeIndex !== undefined ? newAgentIds[t.assigneeIndex] : undefined,
      creatorId: 'system',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      comments: [],
      subtasks: t.subtasks ? t.subtasks.map(st => ({ id: uuidv4(), title: st, completed: false })) : []
    }));

    const newLog: Log = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      agentId: 'system',
      action: 'Template Applied',
      details: `Started new company with template: ${template.name}`,
      type: 'success'
    };

    return {
      agents: newAgents,
      tasks: newTasks,
      logs: [newLog],
      isAutopilot: true // Auto-start the magic upon template instantiation
    };
  }),

  toggleAutopilot: () => set((state) => ({
    isAutopilot: !state.isAutopilot,
    logs: [{
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      agentId: 'system',
      action: !state.isAutopilot ? 'Autopilot Engaged' : 'Autopilot Disabled',
      details: !state.isAutopilot ? 'AI Orchestration engine has taken over.' : 'System set to manual mode.',
      type: 'info' as const
    }, ...state.logs].slice(0, 100)
  }))
}));
