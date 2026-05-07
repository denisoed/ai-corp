import { getStore, mutateStore } from './store';
import { Agent, Task, ApprovalRequestInput } from '../types';
import { createChatSession } from './llm';
import { buildSystemPrompt, loadMemory, appendMessage } from './agent-memory';
import { executeTool } from './tools/index';
import { runPipelineInstance } from './pipeline-engine';
import { publishEvent, createApprovalRequestedEvent } from './events';

const runningTaskRuns = new Set<string>();

function logTask(agentId: string, action: string, details: string, type: 'info' | 'success' | 'warning' | 'error' = 'info', metadata?: Record<string, unknown>) {
  mutateStore(s => {
    s.logs.unshift({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      agentId,
      action,
      details,
      type,
      source: 'task-autopilot',
      category: 'task',
      metadata,
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
    '- If you need a decision or approval, call request_approval with approverAgentName pointing to the relevant agent (Manager, Reviewer, DevOps, etc.). Only fall back to human approval if no appropriate agent exists.',
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

  const taskMeta = { taskId: task.id, taskTitle: task.title, assigneeName: agent.name, workspaceId: agent.workspaceId };
  logTask(agent.id, 'Task Autopilot Started', `Starting autonomous work on "${task.title}".`, 'info', taskMeta);

  try {
    const memory = loadMemory(agent.id);
    if (!memory) {
      logTask(agent.id, 'Task Autopilot Memory Missing', `No memory found for "${task.title}", using live context only.`, 'warning', taskMeta);
    }

    const chatSession = createChatSession(agent, buildTaskPrompt(agent, task));
    const userMessage = `Work on task "${task.title}" until it is complete. Keep the task updated via tools.`;
    let response = await chatSession.sendMessage(userMessage);
    let replyText = response.text;
    let safetyCounter = 0;

    while (response.toolCalls && response.toolCalls.length > 0) {
      safetyCounter += 1;
      if (safetyCounter > 40) {
        logTask(agent.id, 'Task Autopilot Safety Stop', `Stopping "${task.title}" after too many tool loops.`, 'warning', taskMeta);
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

        logTask(agent.id, 'Task Tool Call', `${call.function.name}(${JSON.stringify(args).slice(0, 400)})`, 'info', { ...taskMeta, toolName: call.function.name, toolArgs: args });
        const result = await executeTool(call.function.name, args, agent.id);
        results.push(result);

        if (call.function.name === 'request_approval' || result?.status === 'pending_approval') {
          logTask(agent.id, 'Task Autopilot Waiting For Approval', `Paused "${task.title}" until approval is resolved.`, 'warning', taskMeta);
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

    logTask(agent.id, 'Task Autopilot Finished', `Finished autonomous pass for "${task.title}".`, 'success', taskMeta);
  } catch (e: any) {
    logTask(agent.id, 'Task Autopilot Failed', `Failed on "${task.title}": ${e.message}`, 'error', taskMeta);
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
          logTask(agent.id, 'Task Autopilot Loop Error', `Unexpected error while running "${task.title}": ${err.message}`, 'error', { taskId: task.id, taskTitle: task.title });
        }
      });
    }
  }, 5000);

  console.log('[TaskAutopilot] Manager initialized');
}

export async function runApprovalAutopilot(approval: any): Promise<void> {
  const store = getStore();
  const approver = store.agents.find(a => a.id === approval.approverAgentId);
  const requester = store.agents.find(a => a.id === approval.agentId);
  if (!approver) return;

  mutateStore(s => {
    const a = s.agents.find(x => x.id === approval.approverAgentId);
    if (a) { a.status = 'Working'; a.activeSessions = (a.activeSessions || 0) + 1; }
  });

  try {
    const systemPrompt = buildSystemPrompt(approver) + '\n\n' + [
      'You have a pending approval request from another agent.',
      '',
      'Operating rules:',
      '- Review the request carefully.',
      '- Call respond_to_approval with the approvalId, approved=true/false, and a reason.',
      '- If you need more information, write a task comment or send a message to the requester.',
    ].join('\n');

    const chatSession = createChatSession(approver, systemPrompt);
    let response = await chatSession.sendMessage(
      `${requester?.name || 'Another agent'} is requesting approval:\n\n` +
      `Action: ${approval.action}\n` +
      `Details: ${approval.details || ''}\n` +
      `Risk: ${approval.risk}\n` +
      `Approval ID: ${approval.id}\n\n` +
      `Call respond_to_approval with approvalId="${approval.id}" to approve or reject.`
    );

    let safetyCounter = 0;
    while (response.toolCalls && response.toolCalls.length > 0) {
      safetyCounter++;
      if (safetyCounter > 10) break;

      const results = [];
      for (const call of response.toolCalls) {
        let args: any;
        try { args = JSON.parse(call.function.arguments); } catch { continue; }
        const result = await executeTool(call.function.name, args, approver.id);
        results.push(result);

        if (call.function.name === 'respond_to_approval') {
          logTask(approver.id, 'Approval Autopilot Resolved', `Approval ${approval.id} resolved by ${approver.name}.`, 'success', { approvalId: approval.id, approved: args.approved });
          return;
        }
      }
      response = await chatSession.sendToolResults(response.toolCalls, results);
    }
  } finally {
    mutateStore(s => {
      const a = s.agents.find(x => x.id === approval.approverAgentId);
      if (a) {
        a.activeSessions = Math.max(0, (a.activeSessions || 0) - 1);
        if (a.status === 'Working') a.status = 'Idle';
      }
    });
  }
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
  if (!task && !input.commandRunId) {
    return { success: false, error: `Task "${input.taskTitle || input.taskId || 'unknown'}" not found.` };
  }

  const approvalId = crypto.randomUUID();

  if (input.approverAgentId) {
    const approver = store.agents.find(a => a.id === input.approverAgentId);
    if (!approver) return { success: false, error: `Approver agent "${input.approverAgentName}" not found.` };

    const approval = {
      id: approvalId,
      taskId: task?.id,
      agentId: input.agentId,
      commandRunId: input.commandRunId,
      action: input.action,
      risk: input.risk,
      estimatedCost: input.estimatedCost,
      status: 'pending' as const,
      createdAt: new Date().toISOString(),
      details: input.details,
      approverAgentId: input.approverAgentId,
      approverAgentName: input.approverAgentName,
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
            content: `[Awaiting approval from ${approver.name}]: ${input.details || input.action}`,
            createdAt: new Date().toISOString(),
            type: 'action'
          });
        }
      }
      const a = s.agents.find(x => x.id === input.agentId);
      if (a) a.status = 'Blocked';

      const now = new Date().toISOString();
      s.subscriptions.unshift({
        id: crypto.randomUUID(),
        agentId: input.approverAgentId!,
        eventType: 'approval.requested',
        channel: 'internal',
        enabled: true,
        createdAt: now,
        updatedAt: now,
        oneshot: true,
        filters: {},
      });
      if (s.subscriptions.length > 100) s.subscriptions = s.subscriptions.slice(0, 100);
    });

    logTask(agent.id, 'Agent Approval Requested', `Requested approval from ${approver.name} for "${input.action}".`, 'warning', { approvalId, approverAgentName: approver.name, action: input.action });
    void publishEvent(createApprovalRequestedEvent(approval, task?.title));
    return { success: true, approvalId };
  }

  const approval = {
    id: approvalId,
    taskId: task?.id,
    agentId: input.agentId,
    commandRunId: input.commandRunId,
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

  logTask(agent.id, 'Approval Requested', `Requested approval for "${input.action}"${task ? ` on task ${task.title}` : ''}.`, 'warning', { ...(task ? { taskId: task.id, taskTitle: task.title } : {}), approvalId, action: input.action, risk: input.risk, estimatedCost: input.estimatedCost });
  return { success: true, approvalId };
}

export function handleRespondToApproval(args: any, agentId: string) {
  const store = getStore();
  const agent = store.agents.find(a => a.id === agentId);
  if (!agent) return { success: false, error: 'Agent not found' };

  const approval = store.approvals.find(a => a.id === args.approvalId);
  if (!approval) return { success: false, error: 'Approval not found' };
  if (approval.status !== 'pending') return { success: false, error: 'Approval already resolved' };
  if (approval.approverAgentId !== agentId) return { success: false, error: 'This approval was not sent to you' };

  const approved = args.approved;
  const reason = args.reason || '';

  mutateStore(s => {
    const a = s.approvals.find(x => x.id === args.approvalId);
    if (!a) return;
    a.status = approved ? 'approved' : 'rejected';

    if (a.taskId) {
      const task = s.tasks.find(t => t.id === a.taskId);
      if (task) {
        const previousStatus = task.status;
        task.status = 'In Progress';
        task.updatedAt = new Date().toISOString();
        task.comments.push({
          id: crypto.randomUUID(),
          authorId: agentId,
          authorName: agent.name,
          content: approved
            ? `Approved: ${a.action}${reason ? ` (${reason})` : ''}. Proceeding.`
            : `Rejected: ${a.action}${reason ? ` (${reason})` : ''}. Please revise.`,
          createdAt: new Date().toISOString(),
          type: 'action'
        });
      }
    }

    const requestingAgent = s.agents.find(x => x.id === a.agentId);
    if (requestingAgent) requestingAgent.status = 'Idle';

    s.logs.unshift({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      agentId,
      action: approved ? 'Agent Approval Granted' : 'Agent Approval Rejected',
      details: `${agent.name} ${approved ? 'approved' : 'rejected'} request from ${requestingAgent?.name || 'unknown'}: ${a.action}`,
      type: approved ? 'success' : 'error',
      source: 'system',
      category: 'approval',
      metadata: { approvalId: a.id, action: a.action, resolvedBy: agent.name },
    });
    if (s.logs.length > 100) s.logs = s.logs.slice(0, 100);
  });

  resumePipelineIfStageTask(approval.taskId);

  return { success: true, approved, reason };
}

export function resumePipelineIfStageTask(taskId?: string) {
  if (!taskId) return;
  const store = getStore();
  const task = store.tasks.find(t => t.id === taskId);
  if (!task) return;
  const hasPipelineTag = task.tags?.some(t => t.startsWith('pipeline:'));
  if (!hasPipelineTag) return;

  const pipelineId = task.tags?.find(t => t.startsWith('pipeline:'))?.replace('pipeline:', '');
  if (!pipelineId) return;

  const instance = store.pipelineInstances.find(pi =>
    pi.pipelineId === pipelineId && pi.taskId === taskId && pi.status === 'paused'
  );
  if (!instance) return;

  const pipeline = store.pipelines.find(p => p.id === pipelineId);
  if (!pipeline) return;

  const currentStage = pipeline.stages[instance.currentStageIndex];
  if (!currentStage) return;

  mutateStore(s => {
    const inst = s.pipelineInstances.find(pi => pi.id === instance.id);
    if (inst) { inst.status = 'running'; inst.updatedAt = new Date().toISOString(); }
  });
  void runPipelineInstance(instance.id);
}
