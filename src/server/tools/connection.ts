import { mutateStore, getStore, agentsAreConnected, addConnectionToStore, removeConnectionFromStore, updateConnectionInStore } from '../store';
import { findAgent, logAction } from './agent';

export async function handleAddConnection(args: any, executingAgentId: string): Promise<any> {
  const agent = findAgent(args.agentName);
  if (!agent) return { success: false, error: `Agent "${args.agentName}" not found.` };
  const target = findAgent(args.targetAgentName);
  if (!target) return { success: false, error: `Agent "${args.targetAgentName}" not found.` };
  if (agent.id === target.id) return { success: false, error: 'Cannot connect an agent to itself.' };

  const cType = args.connectionType as string;
  if (!['manager', 'collaborator'].includes(cType)) {
    return { success: false, error: `Invalid connection type "${cType}". Must be "manager" or "collaborator".` };
  }

  mutateStore(s => {
    addConnectionToStore(s, agent.id, target.id, cType);
  });
  logAction('Connection Added', `${cType} connection: ${agent.name} ↔ ${target.name}`, 'info', executingAgentId);
  return { success: true, message: `Created ${cType} connection between "${agent.name}" and "${target.name}".` };
}

export async function handleRemoveConnection(args: any, executingAgentId: string): Promise<any> {
  const agent = findAgent(args.agentName);
  if (!agent) return { success: false, error: `Agent "${args.agentName}" not found.` };
  const target = findAgent(args.targetAgentName);
  if (!target) return { success: false, error: `Agent "${args.targetAgentName}" not found.` };

  let removed = false;
  mutateStore(s => {
    removed = removeConnectionFromStore(s, agent.id, target.id);
  });

  if (!removed) return { success: false, error: `No connection found between "${agent.name}" and "${target.name}".` };
  logAction('Connection Removed', `Removed connection: ${agent.name} ↔ ${target.name}`, 'warning', executingAgentId);
  return { success: true, message: `All connections between "${agent.name}" and "${target.name}" removed.` };
}

export async function handleUpdateConnection(args: any, executingAgentId: string): Promise<any> {
  const agent = findAgent(args.agentName);
  if (!agent) return { success: false, error: `Agent "${args.agentName}" not found.` };
  const target = findAgent(args.targetAgentName);
  if (!target) return { success: false, error: `Agent "${args.targetAgentName}" not found.` };
  if (agent.id === target.id) return { success: false, error: 'Cannot connect an agent to itself.' };

  const cType = args.connectionType as string;
  if (!['manager', 'collaborator', 'none'].includes(cType)) {
    return { success: false, error: `Invalid connection type "${cType}". Must be "manager", "collaborator", or "none".` };
  }

  mutateStore(s => {
    updateConnectionInStore(s, agent.id, target.id, cType);
  });
  logAction('Connection Updated', `Changed to ${cType}: ${agent.name} ↔ ${target.name}`, 'info', executingAgentId);
  return { success: true, message: `Connection between "${agent.name}" and "${target.name}" updated to ${cType}.` };
}

export async function handleResolveApproval(args: any, executingAgentId: string): Promise<any> {
  let result: any = {};
  const now = new Date().toISOString();

  mutateStore(s => {
    const approval = s.approvals.find(a => a.id === args.approvalId);
    if (!approval) {
      result = { success: false, error: 'Approval not found.' };
      return;
    }

    approval.status = args.approved ? 'approved' : 'rejected';
    const fixSubtask = { id: crypto.randomUUID(), title: 'Fix issues based on feedback', completed: false };

    if (approval.taskId) {
      const task = s.tasks.find(t => t.id === approval.taskId);
      if (task) {
        task.status = args.approved ? 'Review' : 'In Progress';
        task.updatedAt = now;
        if (!args.approved) {
          task.subtasks.push(fixSubtask);
        }
        task.comments.push({
          id: crypto.randomUUID(),
          authorId: 'user',
          authorName: 'Admin (You)',
          content: args.approved ? `Approval granted for: ${approval.action}. Proceeding.` : 'Approval denied. Please revise according to comments.',
          createdAt: now,
          type: 'action'
        });
      }
    }

    if (approval.agentId) {
      const agent = s.agents.find(a => a.id === approval.agentId);
      if (agent) agent.status = 'Idle';
    }

    s.logs.unshift({
      id: crypto.randomUUID(),
      timestamp: now,
      agentId: 'user',
      action: args.approved ? 'Approval Granted' : 'Approval Rejected',
      details: `User ${args.approved ? 'approved' : 'rejected'} action: ${approval.action}`,
      type: args.approved ? 'success' : 'error'
    });
    if (s.logs.length > 100) s.logs = s.logs.slice(0, 100);

    result = { success: true, message: `Approval ${args.approved ? 'granted' : 'denied'}.` };
  });
  return result;
}
