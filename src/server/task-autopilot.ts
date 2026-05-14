import { getStore, mutateStore, getEffectivePermissions } from './store';
import { Agent, Task, ApprovalRequestInput, Pipeline, PipelineInstance, PipelineStage, PermissionType } from '../types';
import { createChatSession } from './llm';
import { buildSystemPrompt, loadMemory, appendMessage } from './agent-memory';
import { executeTool } from './tools/index';
import { runPipelineInstance } from './pipeline-engine';
import { publishEvent, createApprovalRequestedEvent } from './events';

const runningTaskRuns = new Set<string>();

function truncateDesc(text: string): string {
  if (text.length <= 500) return text;
  return text.slice(0, 497) + '...';
}

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

export function shouldAutopilot(task: Task, agent: Agent): boolean {
  if (task.status === 'Done' || task.status === 'Failed' || task.status === 'Blocked') return false;
  if (task.status !== 'In Progress') return false;
  if (task.assigneeId !== agent.id) return false;
  if (agent.status === 'Offline' || agent.status === 'Error') return false;
  if (task.tags && task.tags.some(t => t.startsWith('pipeline:'))) return false;
  return true;
}

function buildTaskPrompt(agent: Agent, task: Task, context?: { permissions?: string; pipeline?: string; workspace?: string }): string {
  const summary = [
    `You are working autonomously on the task "${task.title}".`,
    `Goal: finish the task end-to-end.`,
    `Current status: ${task.status}. Priority: ${task.priority}. Risk: ${task.risk}.`,
    `Task description: ${truncateDesc(task.description)}`,
    task.tags.length ? `Tags: ${task.tags.join(', ')}` : '',
    task.subtasks.length ? `Subtasks: ${task.subtasks.map(st => `${st.completed ? '[x]' : '[ ]'} ${st.title}`).join('; ')}` : '',
    task.comments.length ? `Existing comments: ${task.comments.slice(-3).map(c => `${c.authorName}: ${c.content.length > 150 ? c.content.slice(0, 147) + '...' : c.content}`).join(' | ')}` : '',
    context?.workspace || '',
    context?.permissions || '',
    context?.pipeline || '',
  ].filter(Boolean);

  return buildSystemPrompt(agent, 'autopilot') + '\n\n' + summary.join('\n');
}

async function runTaskAutopilot(task: Task): Promise<void> {
  const store = getStore();
  const agent = store.agents.find(a => a.id === task.assigneeId);
  if (!agent) return;
  if (!shouldAutopilot(task, agent)) return;

  const runKey = `${task.id}:${agent.id}`;
  if (runningTaskRuns.has(runKey)) return;
  runningTaskRuns.add(runKey);

  const taskMeta = { taskId: task.id, taskTitle: task.title, assigneeName: agent.name, workspaceId: agent.workspaceId };

  const freshTask = getStore().tasks.find(t => t.id === task.id);
  if (!freshTask || freshTask.status === 'Done' || freshTask.status === 'Failed' || freshTask.status === 'Blocked') {
    logTask(agent.id, 'Task Autopilot Blocked', `Task "${task.title}" is ${freshTask?.status || 'gone'} — nothing to do.`, 'info', taskMeta);
    return;
  }
  if (freshTask.tags && freshTask.tags.some(t => t.startsWith('pipeline:'))) {
    logTask(agent.id, 'Task Autopilot Blocked', `Task "${task.title}" is a pipeline task — pipeline engine handles it.`, 'info', taskMeta);
    return;
  }
  const activeInstance = getStore().pipelineInstances.find(
    pi => pi.taskId === task.id && (pi.status === 'running' || pi.status === 'paused')
  );
  if (activeInstance) {
    logTask(agent.id, 'Task Autopilot Blocked', `Task "${task.title}" has active pipeline instance (${activeInstance.status}) — pipeline engine handles it.`, 'info', taskMeta);
    return;
  }

  const now = new Date().toISOString();
  mutateStore(s => {
    const a = s.agents.find(x => x.id === agent.id);
    if (a) {
      a.status = 'Working';
      a.currentTaskId = task.id;
      if ((a.activeSessions || 0) > 5) a.activeSessions = 0;
      a.activeSessions = (a.activeSessions || 0) + 1;
    }
  });

  logTask(agent.id, 'Task Autopilot Started', `Starting autonomous work on "${task.title}".`, 'info', taskMeta);

  try {

    const memory = loadMemory(agent.id);
    if (!memory) {
      logTask(agent.id, 'Task Autopilot Memory Missing', `No memory found for "${task.title}", using live context only.`, 'warning', taskMeta);
    }

    const permissions = getEffectivePermissions(agent.id);
    const permTypes = [...new Set(permissions.map(p => p.type))];
    const permissionsContext = permTypes.length > 0
      ? `# PERMISSIONS\nYou have: ${permTypes.join(', ')}. If blocked on a missing permission, call request_approval — do NOT self-grant.`
      : '# PERMISSIONS\nNo effective permissions. Call request_approval to escalate.';

    const ws = store.workspaces.find(w => w.id === agent.workspaceId);
    const workspaceContext = ws ? `# WORKSPACE\n\nName: ${ws.name}\nID: ${ws.id}\nSlug: ${ws.slug}` : '';

    const pipelineTag = task.tags?.find(t => t.startsWith('pipeline:'));
    const pipelineContext = pipelineTag ? (() => {
      const pId = pipelineTag.replace('pipeline:', '');
      const pipeline = store.pipelines.find(p => p.id === pId);
      if (!pipeline) return '';
      const instance = store.pipelineInstances.find(pi => pi.pipelineId === pId && pi.taskId === task.id);
      const currentStage = instance ? pipeline.stages[instance.currentStageIndex] : undefined;
      const lines = [`# PIPELINE CONTEXT\n\nPipeline: ${pipeline.name}`];
      if (currentStage) lines.push(`Current stage: ${currentStage.name} (${currentStage.assigneeRole})`);
      if (currentStage?.instructions) lines.push(`Stage instructions: ${currentStage.instructions}`);
      if (instance) lines.push(`Instance status: ${instance.status} (stage ${(instance.currentStageIndex || 0) + 1}/${pipeline.stages.length})`);
      return lines.join('\n');
    })() : '';

    const finalPrompt = buildTaskPrompt(agent, task, {
      permissions: permissionsContext,
      workspace: workspaceContext,
      pipeline: pipelineContext,
    });

    const chatSession = createChatSession(agent, finalPrompt);
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

        if (call.function.name === 'request_approval' || result?.status === 'pending_approval' || result?.status === 'needs_approval') {
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
    const msg = String(e.message ?? '');
    const isInputError = msg.includes('is not a function') || msg.includes('is not defined') || msg.includes('Cannot read properties') || msg.includes('not a string');
    const isCreditError = msg.includes('402') || msg.includes('insufficient credits') || msg.includes('Insufficient credits') || msg.includes('not enough credits');
    if (isCreditError || isInputError) {
      const failedTask = getStore().tasks.find(t => t.id === task.id);
      if (failedTask) {
        mutateStore(s => {
          const t = s.tasks.find(x => x.id === task.id);
          if (t) {
            t.status = 'Failed';
            t.updatedAt = new Date().toISOString();
            t.comments.push({
              id: crypto.randomUUID(),
              authorId: agent.id,
              authorName: agent.name,
              content: isCreditError
                ? `Task failed due to insufficient API credits: ${e.message}. Add credits and retry.`
                : `Task failed due to input error: ${e.message}. The task may use an incompatible model or format.`,
              createdAt: new Date().toISOString(),
              type: 'action',
            });
          }
        });
      }
    } else {
      throw e;
    }
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
      if (task.tags && task.tags.some(t => t.startsWith('pipeline:'))) return false;
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

  if (!approval.requiredPermission && (approval.risk === 'low' || approval.risk === 'medium')) {
    logTask(approver.id, 'Approval Auto-Approved', `Auto-approved ${approval.risk} risk request "${approval.action}".`, 'success', { approvalId: approval.id, risk: approval.risk });
    handleRespondToApproval({ approvalId: approval.id, approved: true, reason: `Auto-approved (${approval.risk} risk).` }, approver.id);
    return;
  }

  mutateStore(s => {
    const a = s.agents.find(x => x.id === approval.approverAgentId);
    if (a) {
      if ((a.activeSessions || 0) > 5) a.activeSessions = 0;
      a.status = 'Working';
      a.activeSessions = (a.activeSessions || 0) + 1;
    }
  });

  try {
    const isPermissionRequest = approval.requiredPermission;

    if (!isPermissionRequest) {
      const systemPrompt = buildSystemPrompt(approver) + '\n\n' + [
        'You have a pending approval request from another agent.',
        'Review the request and call respond_to_approval with your decision immediately.',
        'Do NOT use any other tools — just respond to the approval.',
      ].join('\n');

      const chatSession = createChatSession(approver, systemPrompt);
      const actionText = `${requester?.name || 'Another agent'} is requesting approval:\n\n` +
        `Action: ${approval.action}\n` +
        `Details: ${approval.details || ''}\n` +
        `Risk: ${approval.risk}\n` +
        `Approval ID: ${approval.id}\n\n` +
        `Call respond_to_approval with approvalId="${approval.id}" to approve or reject. Use approved=true for approval, false for rejection.`;
      let response = await chatSession.sendMessage(actionText);

      let safetyCounter = 0;
      while (response.toolCalls && response.toolCalls.length > 0) {
        safetyCounter++;
        if (safetyCounter > 3) break;

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
    } else {
      const systemPrompt = buildSystemPrompt(approver) + '\n\n' + [
        'You have a pending permission request from another agent.',
        'You must ask the human user to decide via Telegram.',
        'Send a clear message using send_telegram_message, then wait for the user\'s reply. When they respond, call respond_to_approval.',
      ].join('\n');

      const chatSession = createChatSession(approver, systemPrompt);
      const actionText = `PERMISSION REQUESTED by ${requester?.name || 'Another agent'}: ${approval.action}\n\nPermission needed: ${approval.requiredPermission}${approval.permissionScope ? ` for ${approval.permissionScope.join(', ')}` : ''}\n\nDetails: ${approval.details || ''}\nRisk: ${approval.risk}\nApproval ID: ${approval.id}\n\nSend a Telegram message to the user asking them to decide. When they reply, call respond_to_approval with approvalId="${approval.id}".`;
      let response = await chatSession.sendMessage(actionText);

      let safetyCounter = 0;
      while (response.toolCalls && response.toolCalls.length > 0) {
        safetyCounter++;
        if (safetyCounter > 3) break;

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

  if (input.requiredPermission) {
    if (input.requiredPermission === 'system:manage_permissions' || input.requiredPermission === 'system:manage_roles') {
      return { success: false, error: `Permission "${input.requiredPermission}" cannot be requested through approval. Contact your administrator.` };
    }

    const existingPerms = getEffectivePermissions(input.agentId);
    const missing = !existingPerms.some(p =>
      p.type === input.requiredPermission &&
      (p.scope === 'all' || (input.permissionScope && Array.isArray(p.scope) && input.permissionScope.every(s => p.scope.includes(s))))
    );
    if (!missing) {
      return { success: true, approvalId: 'already_granted' };
    }

    const telegramAgent = store.agents.find(a => a.telegramConfig?.botToken);
    if (telegramAgent) {
      input.approverAgentId = telegramAgent.id;
      input.approverAgentName = telegramAgent.name;
    }
  }

  // Fallback: route to any agent with Telegram if no approver specified
  if (!input.approverAgentId) {
    const telegramAgent = store.agents.find(a => a.telegramConfig?.botToken);
    if (telegramAgent) {
      input.approverAgentId = telegramAgent.id;
      input.approverAgentName = telegramAgent.name;
    }
  }

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
      requiredPermission: input.requiredPermission,
      permissionScope: input.permissionScope,
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
    details: input.details,
    requiredPermission: input.requiredPermission,
    permissionScope: input.permissionScope,
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

export async function handleRespondToApproval(args: any, agentId: string) {
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
        if (a.requiredPermission) {
          if (approved) {
            const reqAgent = s.agents.find(x => x.id === a.agentId);
            if (reqAgent) {
              if (!reqAgent.permissions) reqAgent.permissions = [];
              if (!reqAgent.permissions.some(p => p.type === a.requiredPermission && JSON.stringify(p.scope) === JSON.stringify(a.permissionScope || 'all'))) {
                reqAgent.permissions.push({ type: a.requiredPermission!, scope: a.permissionScope || 'all' });
              }
            }
            task.status = 'In Progress';
            task.comments.push({
              id: crypto.randomUUID(),
              authorId: agentId,
              authorName: agent.name,
              content: `Permission ${a.requiredPermission} granted. ${reason ? `(${reason})` : ''} Proceeding.`,
              createdAt: new Date().toISOString(),
              type: 'action'
            });
          } else {
            task.status = 'Blocked';
            task.comments.push({
              id: crypto.randomUUID(),
              authorId: agentId,
              authorName: agent.name,
              content: `Permission ${a.requiredPermission} denied. ${reason ? `(${reason})` : ''} Task blocked.`,
              createdAt: new Date().toISOString(),
              type: 'action'
            });
          }
        } else {
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

  if (approved && approval.commandRunId) {
    const { resumeApprovedCommand } = await import('./command-runner');
    await resumeApprovedCommand(approval.commandRunId);
  }

  if (!approval.commandRunId && approval.taskId) {
    const hasCommandApproval = getStore().approvals.some(a =>
      a.id !== approval.id &&
      a.taskId === approval.taskId &&
      a.commandRunId &&
      (a.status === 'pending' || a.status === 'approved')
    );
    if (hasCommandApproval) {
      logTask(agentId, 'Pipeline Resume Deferred', `Another approval with commandRunId exists for task ${approval.taskId} — pipeline will be resumed by that approval.`, 'info', { taskId: approval.taskId });
      return { success: true, approved, reason };
    }
  }

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
