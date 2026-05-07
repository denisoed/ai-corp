import { mutateStore, getStore, agentsAreConnected } from '../store';
import { Task, TaskPriority, TaskRisk, TaskStatus, Comment } from '../../types';
import { findAgent, logAction } from './agent';
import { createTaskAssigneeChangedEvent, createTaskCommentAddedEvent, createTaskCompletedEvent, createTaskStatusChangedEvent, publishEvent } from '../events';

function findTask(title: unknown): Task | undefined {
  if (typeof title !== 'string') return undefined;
  const state = getStore();
  return state.tasks.find(t => t.title.toLowerCase().includes(title.toLowerCase()));
}

export async function handleCreateTask(args: any, executingAgentId: string): Promise<any> {
  const state = getStore();
  const now = new Date().toISOString();

  let assigneeId = undefined;
  if (args.assigneeName) {
    const assignee = findAgent(args.assigneeName);
    if (!assignee) return { success: false, error: `Agent "${args.assigneeName}" not found.` };
    if (assignee.id !== executingAgentId && !agentsAreConnected(executingAgentId, assignee.id, state.agents)) {
      return { success: false, error: `You can only assign tasks to agents you have a relationship with. "${assignee.name}" is not connected to you.` };
    }
    assigneeId = assignee.id;
  }

  mutateStore(s => {
    s.tasks.push({
      id: crypto.randomUUID(),
      title: args.title,
      description: args.description,
      status: 'Backlog',
      priority: args.priority as TaskPriority,
      risk: args.risk as TaskRisk,
      tags: args.tags || [],
      assigneeId,
      creatorId: 'user',
      cost: 0,
      createdAt: now,
      updatedAt: now,
      comments: [],
      subtasks: []
    });
  });
  logAction('Created Task via Telegram', `Added task "${args.title}" to board.`, 'success', executingAgentId, 'tool', 'task', getStore().agents.find(a => a.id === executingAgentId)?.workspaceId, { taskTitle: args.title });
  return { success: true, message: `Task "${args.title}" created successfully.` };
}

export async function handleMoveTask(args: any, executingAgentId: string): Promise<any> {
  const task = findTask(args.taskTitle);
  if (!task) return { success: false, error: `Task "${args.taskTitle}" not found.` };
  const now = new Date().toISOString();
  const previousStatus = task.status;
  const nextStatus = args.newStatus as TaskStatus;

  mutateStore(s => {
    const t = s.tasks.find(x => x.id === task.id);
    if (t) {
      t.status = nextStatus;
      t.updatedAt = now;
    }
  });
  logAction('Task Moved', `Moved "${task.title}" to ${args.newStatus}.`, 'info', executingAgentId, 'tool', 'task', getStore().agents.find(a => a.id === executingAgentId)?.workspaceId, { taskId: task.id, taskTitle: task.title, fromStatus: previousStatus, toStatus: nextStatus });
  if (previousStatus !== nextStatus) {
    void publishEvent(createTaskStatusChangedEvent({ ...task, status: nextStatus, updatedAt: now }, previousStatus, nextStatus, executingAgentId));
    if (nextStatus === 'Done') {
      void publishEvent(createTaskCompletedEvent({ ...task, status: nextStatus, updatedAt: now }, executingAgentId));
    }
  }
  return { success: true, message: `Task "${task.title}" moved to ${args.newStatus}.` };
}

export async function handleAssignTask(args: any, executingAgentId: string): Promise<any> {
  const state = getStore();
  const task = findTask(args.taskTitle);
  if (!task) return { success: false, error: `Task "${args.taskTitle}" not found.` };
  const agent = findAgent(args.agentName);
  if (!agent) return { success: false, error: `Agent "${args.agentName}" not found.` };
  if (agent.id !== executingAgentId && !agentsAreConnected(executingAgentId, agent.id, state.agents)) {
    return { success: false, error: `You can only assign tasks to agents you have a relationship with (manager/subordinate or collaborator). "${agent.name}" is not connected to you.` };
  }

  const now = new Date().toISOString();
  const previousAssigneeId = task.assigneeId;
  mutateStore(s => {
    const t = s.tasks.find(x => x.id === task.id);
    if (t) {
      t.assigneeId = agent.id;
      t.updatedAt = now;
    }
  });
  logAction('Task Assigned', `Assigned "${task.title}" to ${agent.name}.`, 'info', executingAgentId, 'tool', 'task', getStore().agents.find(a => a.id === executingAgentId)?.workspaceId, { taskId: task.id, taskTitle: task.title, targetAgentId: agent.id, targetAgentName: agent.name });
  if (previousAssigneeId !== agent.id) {
    void publishEvent(createTaskAssigneeChangedEvent({ ...task, assigneeId: agent.id, updatedAt: now }, previousAssigneeId, agent.id, executingAgentId));
  }
  return { success: true, message: `Task "${task.title}" assigned to ${agent.name}.` };
}

export async function handleUpdateTask(args: any, executingAgentId: string): Promise<any> {
  const task = findTask(args.taskTitle);
  if (!task) return { success: false, error: `Task "${args.taskTitle}" not found.` };
  const now = new Date().toISOString();

  mutateStore(s => {
    const t = s.tasks.find(x => x.id === task.id);
    if (!t) return;
    if (args.priority) t.priority = args.priority as TaskPriority;
    if (args.risk) t.risk = args.risk as TaskRisk;
    if (args.description) t.description = args.description;
    if (args.tags) t.tags = args.tags;
    t.updatedAt = now;
  });
  logAction('Task Updated', `Updated "${task.title}".`, 'info', executingAgentId, 'tool', 'task', getStore().agents.find(a => a.id === executingAgentId)?.workspaceId, { taskId: task.id, taskTitle: task.title });
  return { success: true, message: `Task "${task.title}" updated.` };
}

export async function handleDeleteTask(args: any, executingAgentId: string): Promise<any> {
  const task = findTask(args.taskTitle);
  if (!task) return { success: false, error: `Task "${args.taskTitle}" not found.` };

  mutateStore(s => {
    s.tasks = s.tasks.filter(t => t.id !== task.id);
  });
  logAction('Task Deleted', `Deleted "${task.title}".`, 'warning', executingAgentId, 'tool', 'task', getStore().agents.find(a => a.id === executingAgentId)?.workspaceId, { taskId: task.id, taskTitle: task.title });
  return { success: true, message: `Task "${task.title}" deleted.` };
}

export async function handleAddTaskComment(args: any, executingAgentId: string): Promise<any> {
  const state = getStore();
  const task = findTask(args.taskTitle);
  if (!task) return { success: false, error: `Task "${args.taskTitle}" not found.` };
  const agent = state.agents.find(a => a.id === executingAgentId);
  const now = new Date().toISOString();

  if (task.assigneeId && !agentsAreConnected(executingAgentId, task.assigneeId, state.agents)) {
    const assignee = state.agents.find(a => a.id === task.assigneeId);
    return { success: false, error: `You can only comment on tasks assigned to agents you are connected to. "${assignee?.name || task.assigneeId}" is not connected to you.` };
  }

  mutateStore(s => {
    const t = s.tasks.find(x => x.id === task.id);
    if (t) {
      t.comments.push({
        id: crypto.randomUUID(),
        authorId: executingAgentId,
        authorName: agent?.name || 'System',
        content: args.content,
        createdAt: now,
        type: (args.type || 'message') as Comment['type']
      });
      t.updatedAt = now;
    }
  });
  const updated = getStore().tasks.find(x => x.id === task.id);
  if (updated) {
    const latestComment = updated.comments[updated.comments.length - 1];
    if (latestComment) {
      void publishEvent(createTaskCommentAddedEvent(updated, latestComment, executingAgentId));
    }
  }
  logAction('Comment Added', `Added comment to "${task.title}".`, 'info', executingAgentId, 'tool', 'task', getStore().agents.find(a => a.id === executingAgentId)?.workspaceId, { taskId: task.id, taskTitle: task.title, authorName: agent?.name });
  return { success: true, message: `Comment added to "${task.title}".` };
}

export async function handleCreateSubtask(args: any, executingAgentId: string): Promise<any> {
  const task = findTask(args.taskTitle);
  if (!task) return { success: false, error: `Task "${args.taskTitle}" not found.` };
  const now = new Date().toISOString();

  mutateStore(s => {
    const t = s.tasks.find(x => x.id === task.id);
    if (t) {
      t.subtasks.push({ id: crypto.randomUUID(), title: args.subtaskTitle, completed: false });
      t.updatedAt = now;
    }
  });
  logAction('Subtask Created', `Added subtask "${args.subtaskTitle}" to "${task.title}".`, 'info', executingAgentId, 'tool', 'task', getStore().agents.find(a => a.id === executingAgentId)?.workspaceId, { taskId: task.id, taskTitle: task.title });
  return { success: true, message: `Subtask "${args.subtaskTitle}" created.` };
}

export async function handleCompleteSubtask(args: any, executingAgentId: string): Promise<any> {
  const task = findTask(args.taskTitle);
  if (!task) return { success: false, error: `Task "${args.taskTitle}" not found.` };
  const subtask = task.subtasks.find(s => s.title.toLowerCase().includes(args.subtaskTitle.toLowerCase()));
  if (!subtask) return { success: false, error: `Subtask "${args.subtaskTitle}" not found.` };
  const now = new Date().toISOString();

  mutateStore(s => {
    const t = s.tasks.find(x => x.id === task.id);
    if (t) {
      const st = t.subtasks.find(x => x.id === subtask.id);
      if (st) st.completed = true;
      t.updatedAt = now;
    }
  });
  logAction('Subtask Completed', `Completed "${args.subtaskTitle}" in "${task.title}".`, 'success', executingAgentId, 'tool', 'task', getStore().agents.find(a => a.id === executingAgentId)?.workspaceId, { taskId: task.id, taskTitle: task.title });
  return { success: true, message: `Subtask "${args.subtaskTitle}" completed.` };
}

export async function handleAddTaskTag(args: any, executingAgentId: string): Promise<any> {
  const task = findTask(args.taskTitle);
  if (!task) return { success: false, error: `Task "${args.taskTitle}" not found.` };
  const now = new Date().toISOString();

  mutateStore(s => {
    const t = s.tasks.find(x => x.id === task.id);
    if (t && !t.tags.includes(args.tag)) {
      t.tags.push(args.tag);
      t.updatedAt = now;
    }
  });
  return { success: true, message: `Tag "${args.tag}" added to "${task.title}".` };
}

export async function handleRemoveTaskTag(args: any, executingAgentId: string): Promise<any> {
  const task = findTask(args.taskTitle);
  if (!task) return { success: false, error: `Task "${args.taskTitle}" not found.` };
  const now = new Date().toISOString();

  mutateStore(s => {
    const t = s.tasks.find(x => x.id === task.id);
    if (t) {
      t.tags = t.tags.filter(tag => tag !== args.tag);
      t.updatedAt = now;
    }
  });
  return { success: true, message: `Tag "${args.tag}" removed from "${task.title}".` };
}

export async function handleSearchTasks(args: any, executingAgentId: string): Promise<any> {
  const state = getStore();
  let tasks = state.tasks;
  if (args.status) tasks = tasks.filter(t => t.status.toLowerCase() === args.status.toLowerCase());
  if (args.priority) tasks = tasks.filter(t => t.priority.toLowerCase() === args.priority.toLowerCase());
  if (args.tag) tasks = tasks.filter(t => t.tags.some(tag => tag.toLowerCase().includes(args.tag.toLowerCase())));
  if (args.assigneeName) {
    const agent = findAgent(args.assigneeName);
    if (agent) tasks = tasks.filter(t => t.assigneeId === agent.id);
  }
  return {
    count: tasks.length,
    tasks: tasks.map(t => ({
      title: t.title,
      status: t.status,
      priority: t.priority,
      assignee: state.agents.find(a => a.id === t.assigneeId)?.name || 'unassigned',
      tags: t.tags
    }))
  };
}

export async function handleGetTaskDetails(args: any, executingAgentId: string): Promise<any> {
  const state = getStore();
  const task = findTask(args.taskTitle);
  if (!task) return { success: false, error: `Task "${args.taskTitle}" not found.` };
  const assignee = state.agents.find(a => a.id === task.assigneeId);
  return {
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    risk: task.risk,
    assignee: assignee?.name || 'unassigned',
    tags: task.tags,
    cost: task.cost,
    subtasks: task.subtasks,
    comments: task.comments,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt
  };
}

export async function handleGetCompanyState(args: any, executingAgentId: string): Promise<any> {
  const state = getStore();

  if (args.focus === 'agents') {
    const connected = state.agents.filter(a => agentsAreConnected(executingAgentId, a.id, state.agents));
    return { agents: connected.map(a => ({ name: a.name, role: a.role, status: a.status })) };
  }
  if (args.focus === 'tasks') {
    return { tasks: state.tasks.map(t => ({ title: t.title, status: t.status, assignee: state.agents.find(a => a.id === t.assigneeId)?.name || 'unassigned' })) };
  }
  return {
    agentsCount: state.agents.length,
    tasksCount: state.tasks.length,
    activeTasks: state.tasks.filter(t => t.status === 'In Progress').length,
    totalCost: state.totalCost
  };
}

export async function handleGenerateReport(args: any, executingAgentId: string): Promise<any> {
  const state = getStore();
  let report = '';
  if (args.type === 'dashboard' || args.type === 'all') {
    report += `DASHBOARD\n`;
    report += `Total Agents: ${state.agents.length}\n`;
    report += `Total Tasks: ${state.tasks.length}\n`;
    report += `Active Tasks: ${state.tasks.filter(t => t.status === 'In Progress').length}\n`;
    report += `Pending Approvals: ${state.approvals.filter(a => a.status === 'pending').length}\n`;
    report += `Total Cost: $${state.totalCost.toFixed(2)}\n\n`;
  }
  if (args.type === 'agents' || args.type === 'all') {
    report += `AGENTS\n`;
    state.agents.forEach(a => {
      const taskCount = state.tasks.filter(t => t.assigneeId === a.id).length;
      report += `- ${a.name} (${a.role}) — ${a.status} — ${taskCount} tasks\n`;
    });
    report += `\n`;
  }
  if (args.type === 'tasks' || args.type === 'all') {
    report += `TASKS BY STATUS\n`;
    const statuses = ['Backlog', 'Planned', 'In Progress', 'Review', 'Needs Approval', 'Done'];
    statuses.forEach(st => {
      const count = state.tasks.filter(t => t.status === st).length;
      report += `${st}: ${count}\n`;
    });
    report += `\n`;
  }
  if (args.type === 'costs' || args.type === 'all') {
    report += `COSTS\n`;
    report += `Total: $${state.totalCost.toFixed(2)}\n`;
    const expensiveTasks = state.tasks.filter(t => t.cost > 0).sort((a, b) => b.cost - a.cost).slice(0, 5);
    if (expensiveTasks.length) {
      report += `Top 5 expensive tasks:\n`;
      expensiveTasks.forEach(t => report += `- ${t.title}: $${t.cost.toFixed(2)}\n`);
    }
  }
  return { success: true, report: report.trim() };
}
