import { getStore, mutateStore } from './store';
import { Agent, Task, ApprovalRequestInput } from '../types';
import { createChatSession } from './llm';
import { buildSystemPrompt, loadMemory } from './agent-memory';
import { executeTool } from './tools/index';

const runningTaskRuns = new Set<string>();

function logTask(agentId: string, action: string, details: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') {
  mutateStore(s => {
    s.logs.unshift({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      agentId,
      action,
      details: `[TaskAutopilot] ${details}`,
      type
    });
    if (s.logs.length > 100) s.logs = s.logs.slice(0, 100);
  });
}

function shouldAutopilot(task: Task, agent: Agent): boolean {
  if (task.status !== 'In Progress') return false;
  if (task.assigneeId !== agent.id) return false;
  if (agent.status === 'Offline' || agent.status === 'Error') return false;
  return true;
}

function buildTaskPrompt(agent: Agent, task: Task): string {
  const summary = [
    `You are working autonomously on the task "${task.title}".`,
    `Goal: finish the task end-to-end.`,
    `Current status: ${task.status}. Priority: ${task.priority}. Risk: ${task.risk}.`,
    `Task description: ${task.description}`,
    task.tags.length ? `Tags: ${task.tags.join(', ')}` : '',
    task.subtasks.length ? `Subtasks: ${task.subtasks.map(st => `${st.completed ? '[x]' : '[ ]'} ${st.title}`).join('; ')}` : '',
    task.comments.length ? `Existing comments: ${task.comments.slice(-5).map(c => `${c.authorName}: ${c.content}`).join(' | ')}` : '',
    '',
    'Operating rules:',
    '- Keep the user informed by writing task comments at meaningful milestones.',
    '- Move the task across columns as work progresses.',
    '- Use create_subtask when decomposing work.',
    '- Use add_task_tag or remove_task_tag if it helps with tracking.',
    '- If you need human decision or clarification, call request_approval with a clear question and then stop until it is resolved.',
    '- If blocked, move the task to Blocked and explain why in a comment.',
    '- When complete, move the task to Done and add a final summary comment.',
  ].filter(Boolean);

  return buildSystemPrompt(agent) + '\n\n' + summary.join('\n');
}

async function runTaskAutopilot(task: Task): Promise<void> {
  const store = getStore();
  const agent = store.agents.find(a => a.id === task.assigneeId);
  if (!agent) return;
  if (!shouldAutopilot(task, agent)) return;

  const runKey = `${task.id}:${agent.id}`;
  if (runningTaskRuns.has(runKey)) return;
  runningTaskRuns.add(runKey);

  const now = new Date().toISOString();
  mutateStore(s => {
    const a = s.agents.find(x => x.id === agent.id);
    if (a) {
      a.status = 'Working';
      a.currentTaskId = task.id;
      a.activeSessions = (a.activeSessions || 0) + 1;
    }
  });

  logTask(agent.id, 'Task Autopilot Started', `Starting autonomous work on "${task.title}".`, 'info');

  try {
    const memory = loadMemory(agent.id);
    if (!memory) {
      logTask(agent.id, 'Task Autopilot Memory Missing', `No memory found for "${task.title}", using live context only.`, 'warning');
    }

    const chatSession = createChatSession(agent, buildTaskPrompt(agent, task));
    const userMessage = `Work on task "${task.title}" until it is complete. Keep the task updated via tools.`;
    let response = await chatSession.sendMessage(userMessage);
    let replyText = response.text;
    let safetyCounter = 0;

    while (response.toolCalls && response.toolCalls.length > 0) {
      safetyCounter += 1;
      if (safetyCounter > 40) {
        logTask(agent.id, 'Task Autopilot Safety Stop', `Stopping "${task.title}" after too many tool loops.`, 'warning');
        break;
      }

      const results = [];
      for (const call of response.toolCalls) {
        let args: any;
        try {
          args = JSON.parse(call.function.arguments);
        } catch {
          results.push({ success: false, error: 'Invalid tool arguments' });
          continue;
        }

        logTask(agent.id, 'Task Tool Call', `${call.function.name}(${JSON.stringify(args).slice(0, 400)})`, 'info');
        const result = await executeTool(call.function.name, args, agent.id);
        results.push(result);

        if (call.function.name === 'request_approval' || result?.status === 'pending_approval') {
          logTask(agent.id, 'Task Autopilot Waiting For Approval', `Paused "${task.title}" until approval is resolved.`, 'warning');
          return;
        }
      }

      response = await chatSession.sendToolResults(response.toolCalls, results);
      if (response.text) {
        replyText = response.text;
      }
    }

    const finalTask = getStore().tasks.find(t => t.id === task.id);
    if (finalTask && finalTask.status === 'In Progress') {
      finalTask.comments.push({
        id: crypto.randomUUID(),
        authorId: agent.id,
        authorName: agent.name,
        content: replyText?.trim() || 'Autonomous work completed.',
        createdAt: now,
        type: 'message'
      });
      finalTask.updatedAt = new Date().toISOString();
    }

    logTask(agent.id, 'Task Autopilot Finished', `Finished autonomous pass for "${task.title}".`, 'success');
  } catch (e: any) {
    logTask(agent.id, 'Task Autopilot Failed', `Failed on "${task.title}": ${e.message}`, 'error');
    throw e;
  } finally {
    mutateStore(s => {
      const a = s.agents.find(x => x.id === agent.id);
      if (a) {
        a.activeSessions = Math.max(0, (a.activeSessions || 0) - 1);
        if (a.currentTaskId === task.id) a.currentTaskId = undefined;
        if (a.status === 'Working') a.status = 'Idle';
      }
    });
    runningTaskRuns.delete(runKey);
  }
}

export function startTaskAutopilotManager(): void {
  setInterval(() => {
    const store = getStore();
    const candidates = store.tasks.filter(task => {
      const agent = task.assigneeId ? store.agents.find(a => a.id === task.assigneeId) : undefined;
      return Boolean(agent && shouldAutopilot(task, agent));
    });

    for (const task of candidates) {
      void runTaskAutopilot(task).catch(err => {
        const agent = getStore().agents.find(a => a.id === task.assigneeId);
        if (agent) {
          logTask(agent.id, 'Task Autopilot Loop Error', `Unexpected error while running "${task.title}": ${err.message}`, 'error');
        }
      });
    }
  }, 5000);

  console.log('[TaskAutopilot] Manager initialized');
}

export async function requestApproval(input: ApprovalRequestInput & { taskTitle?: string }): Promise<{ success: boolean; approvalId?: string; error?: string }> {
  const store = getStore();
  const agent = store.agents.find(a => a.id === input.agentId);
  if (!agent) return { success: false, error: 'Agent not found' };
  const task = input.taskId
    ? store.tasks.find(t => t.id === input.taskId)
    : input.taskTitle
      ? store.tasks.find(t => t.title.toLowerCase().includes(input.taskTitle!.toLowerCase()))
      : undefined;
  if (!task) return { success: false, error: `Task "${input.taskTitle || input.taskId || 'unknown'}" not found.` };

  const approval = {
    id: crypto.randomUUID(),
    taskId: task.id,
    agentId: input.agentId,
    action: input.action,
    risk: input.risk,
    estimatedCost: input.estimatedCost,
    status: 'pending' as const,
    createdAt: new Date().toISOString(),
    details: input.details
  };

  mutateStore(s => {
    s.approvals.unshift(approval);
    if (s.approvals.length > 100) s.approvals = s.approvals.slice(0, 100);
    if (task) {
      const liveTask = s.tasks.find(t => t.id === task.id);
      if (liveTask) {
        liveTask.status = 'Needs Approval';
        liveTask.updatedAt = new Date().toISOString();
        liveTask.comments.push({
          id: crypto.randomUUID(),
          authorId: input.agentId,
          authorName: agent.name,
          content: input.details || `Approval requested: ${input.action}`,
          createdAt: new Date().toISOString(),
          type: 'action'
        });
      }
    }
    const a = s.agents.find(x => x.id === input.agentId);
    if (a) a.status = 'Blocked';
  });

  logTask(agent.id, 'Approval Requested', `Requested approval for "${input.action}" on task ${task?.title || input.taskTitle || 'n/a'}.`, 'warning');
  return { success: true, approvalId: approval.id };
}
