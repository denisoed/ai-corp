import { mutateStore, getStore, agentsAreConnected, ensureDefaultRoles, assignDefaultRole } from '../store';
import { Agent, AgentStatus } from '../../types';
import { createMemory, writePersonalityFile } from '../agent-memory';

export function findAgent(name: string): Agent | undefined {
  const state = getStore();
  return state.agents.find(a => a.name.toLowerCase().includes(name.toLowerCase()));
}

export function logAction(action: string, details: string, type: 'info' | 'success' | 'warning' | 'error', agentId: string) {
  mutateStore(s => {
    s.logs.unshift({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      agentId,
      action,
      details,
      type
    });
    if (s.logs.length > 100) s.logs = s.logs.slice(0, 100);
  });
}

export async function handleCreateAgent(args: any, executingAgentId: string): Promise<any> {
  const state = getStore();
  const executingAgent = state.agents.find(a => a.id === executingAgentId);

  if (!executingAgent?.workspaceId) {
    return { success: false, error: 'You are not assigned to a workspace and cannot perform actions.' };
  }

  let parentId = undefined;
  if (args.managerName) {
    const parent = findAgent(args.managerName);
    if (!parent) return { success: false, error: `Manager "${args.managerName}" not found.` };
    if (!agentsAreConnected(executingAgentId, parent.id, state.agents)) {
      return { success: false, error: `You can only create agents under your manager or collaborator. You are not connected to "${parent.name}".` };
    }
    parentId = parent.id;
  }

  const newAgentId = crypto.randomUUID();
  const workspaceId = executingAgent.workspaceId;

  mutateStore(s => {
    s.agents.push({
      id: newAgentId,
      name: args.name,
      slug: args.slug || args.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      role: args.role as any,
      skills: args.skills || [],
      parentId,
      status: 'Idle',
      workspaceId
    });
    const ws = s.workspaces.find(w => w.id === workspaceId);
    if (ws && !ws.agentIds.includes(newAgentId)) {
      ws.agentIds.push(newAgentId);
    }
    ensureDefaultRoles(workspaceId);
  });

  const newAgent = getStore().agents.find(a => a.id === newAgentId);
  if (newAgent) {
    const ws = getStore().workspaces.find(w => w.id === workspaceId);
    createMemory(newAgent, ws);
    mutateStore(s => {
      assignDefaultRole(newAgentId);
    });
  }

  if (args.soul) writePersonalityFile(newAgentId, 'SOUL.md', args.soul);
  if (args.identity) writePersonalityFile(newAgentId, 'IDENTITY.md', args.identity);
  if (args.roleDoc) writePersonalityFile(newAgentId, 'ROLE.md', args.roleDoc);

  logAction('Hired Agent via Telegram', `Hired ${args.name} (${args.role}) into workspace.`, 'success', executingAgentId);
  return { success: true, message: `Agent ${args.name} created successfully in your workspace.` };
}

export async function handleUpdateAgent(args: any, executingAgentId: string): Promise<any> {
  const agent = findAgent(args.agentName);
  if (!agent) return { success: false, error: `Agent "${args.agentName}" not found.` };

  mutateStore(s => {
    const a = s.agents.find(x => x.id === agent.id);
    if (!a) return;
    if (args.newName) a.name = args.newName;
    if (args.model) a.model = args.model;
    if (args.role) a.role = args.role as any;
    if (args.description) a.description = args.description;
    if (args.skills) a.skills = args.skills;
  });
  logAction('Agent Updated', `Updated ${agent.name}.`, 'info', executingAgentId);
  return { success: true, message: `Agent "${agent.name}" updated.` };
}

export async function handleDeleteAgent(args: any, executingAgentId: string): Promise<any> {
  const { hasPermission } = await import('../store');
  if (!hasPermission(executingAgentId, 'system:manage_agents')) {
    return { success: false, error: 'You do not have system:manage_agents permission.' };
  }

  const agent = findAgent(args.agentName);
  if (!agent) return { success: false, error: `Agent "${args.agentName}" not found.` };

  mutateStore(s => {
    s.agents = s.agents.filter(a => a.id !== agent.id);
  });
  logAction('Agent Removed', `Removed ${agent.name}.`, 'warning', executingAgentId);
  return { success: true, message: `Agent "${agent.name}" removed.` };
}

export async function handleSetAgentStatus(args: any, executingAgentId: string): Promise<any> {
  const agent = findAgent(args.agentName);
  if (!agent) return { success: false, error: `Agent "${args.agentName}" not found.` };

  mutateStore(s => {
    const a = s.agents.find(x => x.id === agent.id);
    if (a) a.status = args.status as AgentStatus;
  });
  logAction('Status Changed', `Set ${agent.name} to ${args.status}.`, 'info', executingAgentId);
  return { success: true, message: `Agent "${agent.name}" status set to ${args.status}.` };
}

export async function handleGetAgentDetails(args: any, executingAgentId: string): Promise<any> {
  const state = getStore();
  const agent = findAgent(args.agentName);
  if (!agent) return { success: false, error: `Agent "${args.agentName}" not found.` };
  const tasks = state.tasks.filter(t => t.assigneeId === agent.id);
  const manager = agent.parentId ? state.agents.find(a => a.id === agent.parentId) : null;
  const collaborators = (agent.collaborators || []).map(id => state.agents.find(a => a.id === id)).filter(Boolean) as Agent[];
  const subordinates = state.agents.filter(a => a.parentId === agent.id);
  const executingAgent = state.agents.find(a => a.id === executingAgentId);

  let connection: string;
  if (agent.id === executingAgentId) {
    connection = 'self';
  } else if (agent.parentId === executingAgentId) {
    connection = 'subordinate';
  } else if (executingAgent?.parentId === agent.id) {
    connection = 'manager';
  } else if (agentsAreConnected(executingAgentId, agent.id, state.agents)) {
    connection = 'collaborator';
  } else {
    connection = 'none';
  }

  return {
    agent: {
      name: agent.name,
      role: agent.role,
      status: agent.status,
      skills: agent.skills,
      description: agent.description,
      manager: manager ? { name: manager.name, role: manager.role } : null,
      collaborators: collaborators.map(c => ({ name: c.name, role: c.role })),
      subordinates: subordinates.map(s => ({ name: s.name, role: s.role })),
    },
    connection,
    tasks: tasks.map(t => ({ title: t.title, status: t.status, priority: t.priority }))
  };
}

export async function handleGetMyConnections(args: any, executingAgentId: string): Promise<any> {
  const state = getStore();
  const executingAgent = state.agents.find(a => a.id === executingAgentId);
  const manager = executingAgent?.parentId ? state.agents.find(a => a.id === executingAgent.parentId) : null;
  const subordinates = state.agents.filter(a => a.parentId === executingAgentId);
  const collaborators = (executingAgent?.collaborators || [])
    .map(id => state.agents.find(a => a.id === id))
    .filter(Boolean) as Agent[];

  return {
    manager: manager ? { name: manager.name, role: manager.role, status: manager.status } : null,
    subordinates: subordinates.map(a => ({ name: a.name, role: a.role, status: a.status })),
    collaborators: collaborators.map(a => ({ name: a.name, role: a.role, status: a.status })),
    totalConnections: (manager ? 1 : 0) + subordinates.length + collaborators.length
  };
}

export async function handleSetAgentPersonality(args: any, executingAgentId: string): Promise<any> {
  const { hasPermission } = await import('../store');
  const agent = findAgent(args.agentName);
  if (!agent) return { success: false, error: `Agent "${args.agentName}" not found.` };

  if (agent.id !== executingAgentId && !hasPermission(executingAgentId, 'system:manage_agents')) {
    return { success: false, error: 'You can only set your own personality unless you have system:manage_agents permission.' };
  }

  const updated: string[] = [];
  if (args.soul) { writePersonalityFile(agent.id, 'SOUL.md', args.soul); updated.push('SOUL'); }
  if (args.identity) { writePersonalityFile(agent.id, 'IDENTITY.md', args.identity); updated.push('IDENTITY'); }
  if (args.role) { writePersonalityFile(agent.id, 'ROLE.md', args.role); updated.push('ROLE'); }

  if (updated.length === 0) {
    return { success: false, error: 'At least one of soul, identity, or role must be provided.' };
  }

  logAction('Personality Updated', `Updated ${updated.join(', ')} for ${agent.name}.`, 'success', executingAgentId);
  return { success: true, message: `Updated ${updated.join(', ')} for ${agent.name}.` };
}
