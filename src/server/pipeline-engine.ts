import { getStore, mutateStore } from './store';
import { Pipeline, PipelineInstance, PipelineStage, PipelineStageResult, Task } from '../types';
import { createChatSession } from './llm';
import { buildSystemPrompt, loadMemory } from './agent-memory';
import { executeTool } from './tools/index';
import { publishEvent } from './events';

const runningInstances = new Set<string>();

function logPipeline(instanceId: string, action: string, details: string, type: 'info' | 'success' | 'warning' | 'error' = 'info', metadata?: Record<string, unknown>) {
  mutateStore(s => {
    s.logs.unshift({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      agentId: 'pipeline-engine',
      action,
      details,
      type,
      source: 'pipeline',
      category: 'pipeline',
      metadata: { instanceId, ...metadata },
    });
    if (s.logs.length > 100) s.logs = s.logs.slice(0, 100);
  });
}

function findAgentByRole(role: string, workspaceId: string): { id: string; name: string } | undefined {
  const store = getStore();
  return store.agents.find(a => a.role === role && a.workspaceId === workspaceId && a.status !== 'Offline');
}

function publishPipelineEvent<K extends PipelineInstance>(
  instance: PipelineInstance,
  pipeline: Pipeline,
  stage: PipelineStage,
  eventType: 'pipeline.stage.started' | 'pipeline.stage.completed' | 'pipeline.stage.failed' | 'pipeline.completed' | 'pipeline.failed',
  extra: Record<string, unknown> = {},
  stageAgentId?: string
) {
  const store = getStore();
  const parentTask = store.tasks.find(t => t.id === instance.taskId);

  const now = new Date().toISOString();
  publishEvent({
    id: crypto.randomUUID(),
    type: eventType,
    taskId: instance.taskId,
    createdAt: now,
    payload: {
      pipelineId: pipeline.id,
      pipelineName: pipeline.name,
      instanceId: instance.id,
      stageId: stage.id,
      stageName: stage.name,
      stageIndex: instance.currentStageIndex,
      totalStages: pipeline.stages.length,
      stageTaskId: instance.taskId,
      ...extra,
    }
  }, stageAgentId || parentTask?.assigneeId);
}

async function executeStage(instance: PipelineInstance, pipeline: Pipeline, stage: PipelineStage): Promise<PipelineStageResult> {
  const store = getStore();
  const task = store.tasks.find(t => t.id === instance.taskId);
  const previousResult = instance.stageResults.find(r => r.stageId === stage.id);
  const result: PipelineStageResult = {
    stageId: stage.id,
    status: 'pending',
    comments: previousResult?.comments || [],
    startedAt: previousResult?.startedAt || new Date().toISOString(),
  };

  const assignee = findAgentByRole(stage.assigneeRole, pipeline.workspaceId);
  if (!assignee) {
    result.status = 'failed';
    result.output = `No agent found with role ${stage.assigneeRole}`;
    result.completedAt = new Date().toISOString();
    return result;
  }

  result.agentId = assignee.id;
  result.agentName = assignee.name;

  const parentTaskId = task?.id || instance.taskId;
  mutateStore(s => {
    const t = s.tasks.find(x => x.id === parentTaskId);
    if (t) {
      if (t.subtasks.length === 0) {
        t.subtasks = pipeline.stages.map(s => ({
          id: s.id,
          title: `${s.name} (${s.assigneeRole})`,
          completed: false,
        }));
      }
      t.assigneeId = assignee.id;
      t.status = 'In Progress';
      t.updatedAt = new Date().toISOString();
    }
  });

  logPipeline(instance.id, 'Pipeline Stage Started', `Stage "${stage.name}" assigned to ${assignee.name}.${previousResult ? ' (resumed)' : ''}`, 'info', {
    stageName: stage.name, stageIndex: instance.currentStageIndex, assigneeName: assignee.name, taskId: instance.taskId
  });

  publishPipelineEvent(instance, pipeline, stage, 'pipeline.stage.started', {}, assignee.id);

  try {
    const agent = store.agents.find(a => a.id === assignee.id);
    if (!agent) throw new Error('Agent not found');

    const memory = loadMemory(agent.id);
    const systemPrompt = buildSystemPrompt(agent, 'pipeline') + '\n\n' + [
      `You are executing stage "${stage.name}" of pipeline "${pipeline.name}".`,
      stage.instructions,
      stage.expectedOutput ? `Expected output: ${stage.expectedOutput}` : '',
      task ? `Parent task context:\nTitle: ${task.title}\nDescription: ${task.description}` : '',
    ].filter(Boolean).join('\n');

    const chatSession = createChatSession(agent, systemPrompt, {
      initialMessages: ((previousResult?.chatMessages || []) as any[]).map(m => ({
        role: m.role as 'system' | 'user' | 'assistant' | 'tool',
        content: m.content,
        tool_call_id: m.tool_call_id,
        tool_calls: m.tool_calls as any,
      })),
    });
    const isResumed = previousResult?.chatMessages && previousResult.chatMessages.length > 0;
    let response = isResumed
      ? await chatSession.sendMessage(`Resuming stage "${stage.name}". Continue from where you left off.`)
      : await chatSession.sendMessage(`Execute stage "${stage.name}" of pipeline "${pipeline.name}". Goal: ${stage.instructions}`);

    const stageTimeout = stage.timeoutMinutes ? stage.timeoutMinutes * 60 * 1000 : 0;
    const stageStartTime = Date.now();
    let safetyCounter = 0;
    while (response.toolCalls && response.toolCalls.length > 0) {
      safetyCounter += 1;
      if (safetyCounter > 40) {
        logPipeline(instance.id, 'Pipeline Stage Safety Stop', `Stage "${stage.name}" stopped after 40 tool loops.`, 'warning', { stageName: stage.name });
        break;
      }
      if (stageTimeout > 0 && Date.now() - stageStartTime > stageTimeout) {
        result.status = 'failed';
        result.output = `Stage "${stage.name}" timed out after ${stage.timeoutMinutes} minutes.`;
        result.completedAt = new Date().toISOString();
        result.chatMessages = chatSession.getMessages();
        logPipeline(instance.id, 'Pipeline Stage Timeout', result.output, 'error', { stageName: stage.name });
        publishPipelineEvent(instance, pipeline, stage, 'pipeline.stage.failed', { error: result.output }, assignee.id);
        return result;
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
        const toolResult = await executeTool(call.function.name, args, agent.id);
        results.push(toolResult);

        if (call.function.name === 'request_approval') {
          const r = toolResult as any;
          if (r?.status === 'already_approved' || r?.status === 'already_pending' || r?.approvalId === 'already_granted') {
            continue;
          }
          result.status = 'pending';
          result.comments.push('Stage paused: awaiting approval.');
          result.chatMessages = chatSession.getMessages();
          logPipeline(instance.id, 'Pipeline Stage Waiting Approval', `Stage "${stage.name}" waiting for approval.`, 'warning');
          return result;
        }
        if (toolResult?.status === 'needs_approval') {
          result.status = 'pending';
          result.comments.push('Stage paused: awaiting approval.');
          result.chatMessages = chatSession.getMessages();
          logPipeline(instance.id, 'Pipeline Stage Waiting Approval', `Stage "${stage.name}" waiting for approval.`, 'warning');
          return result;
        }
      }

      const updatedTask = getStore().tasks.find(t => t.id === parentTaskId);
      if (updatedTask?.status === 'Done') {
        result.status = 'completed';
        result.output = response.text?.trim() || 'Stage completed.';
        result.completedAt = new Date().toISOString();
        result.comments.push(response.text?.trim() || 'Stage completed.');
        mutateStore(s => {
          const t = s.tasks.find(x => x.id === parentTaskId);
          if (t) {
            const sub = t.subtasks.find(x => x.id === stage.id);
            if (sub) sub.completed = true;
          }
        });
        break;
      }

      if (updatedTask?.status === 'Blocked' || updatedTask?.status === 'Failed') {
        result.status = 'failed';
        result.output = `Stage ended with status: ${updatedTask.status}`;
        result.completedAt = new Date().toISOString();
        break;
      }

      response = await chatSession.sendToolResults(response.toolCalls, results);
    }

    const finalTask = getStore().tasks.find(t => t.id === parentTaskId);
    if (!result.completedAt) {
      if (finalTask?.status === 'Done') {
        result.status = 'completed';
        result.output = response.text?.trim() || 'Stage completed.';
        result.completedAt = new Date().toISOString();
        mutateStore(s => {
          const t = s.tasks.find(x => x.id === parentTaskId);
          if (t) {
            const sub = t.subtasks.find(x => x.id === stage.id);
            if (sub) sub.completed = true;
          }
        });
      } else if (finalTask?.status === 'Needs Approval') {
        result.status = 'pending';
        result.comments.push('Awaiting approval to complete.');
      } else {
        result.status = finalTask?.status === 'Failed' ? 'failed' : 'completed';
        result.output = response.text?.trim() || 'Stage completed with no output.';
        result.completedAt = new Date().toISOString();
      }
    }

    result.chatMessages = chatSession.getMessages();
    logPipeline(instance.id, 'Pipeline Stage Completed', `Stage "${stage.name}" -> ${result.status}. Agent: ${assignee.name}`, 'info', {
      stageName: stage.name, stageStatus: result.status, assigneeName: assignee.name
    });
    publishPipelineEvent(instance, pipeline, stage, result.status === 'completed' ? 'pipeline.stage.completed' : 'pipeline.stage.failed', { stageStatus: result.status }, assignee.id);

  } catch (e: any) {
    result.status = 'failed';
    result.output = `Error: ${e.message}`;
    result.completedAt = new Date().toISOString();
    logPipeline(instance.id, 'Pipeline Stage Failed', `Stage "${stage.name}" failed: ${e.message}`, 'error', { stageName: stage.name, error: e.message });
    publishPipelineEvent(instance, pipeline, stage, 'pipeline.stage.failed', { error: e.message }, result.agentId);
  }

  return result;
}

export async function runPipelineInstance(instanceId: string): Promise<void> {
  const store = getStore();
  const instance = store.pipelineInstances.find(pi => pi.id === instanceId);
  if (!instance || instance.status !== 'running') return;
  if (runningInstances.has(instanceId)) return;
  runningInstances.add(instanceId);

  try {
    const pipeline = store.pipelines.find(p => p.id === instance.pipelineId);
    if (!pipeline) {
      mutateStore(s => {
        const inst = s.pipelineInstances.find(pi => pi.id === instanceId);
        if (inst) { inst.status = 'failed'; inst.error = 'Pipeline not found'; inst.completedAt = new Date().toISOString(); }
      });
      return;
    }

    while (instance.currentStageIndex < pipeline.stages.length) {
      const stage = pipeline.stages[instance.currentStageIndex];
      let stageResult = await executeStage(instance, pipeline, stage);

      // Retry 429/rate limit errors up to 3 times
      const isRateLimit = (s: string) => /429|rate.limit|too many requests|try again later/i.test(s);
      let retries = 0;
      while (stageResult.status === 'failed' && isRateLimit(stageResult.output || '') && retries < 3) {
        retries++;
        logPipeline(instance.id, 'Pipeline Stage Retry', `Retry ${retries}/3 for "${stage.name}" after rate limit error.`, 'warning');
        await new Promise(resolve => setTimeout(resolve, retries * 5000));
        stageResult = await executeStage(instance, pipeline, stage);
      }

      mutateStore(s => {
        const inst = s.pipelineInstances.find(pi => pi.id === instanceId);
        if (!inst) return;
        const existingIdx = inst.stageResults.findIndex(r => r.stageId === stageResult.stageId);
        if (existingIdx >= 0) {
          inst.stageResults[existingIdx] = stageResult;
        } else {
          inst.stageResults.push(stageResult);
        }
        inst.updatedAt = new Date().toISOString();
        if (stageResult.status === 'failed') {
          inst.status = 'failed';
          inst.error = `Stage "${stage.name}" failed: ${stageResult.output}`;
          inst.completedAt = new Date().toISOString();
        } else if (stageResult.status === 'pending') {
          inst.status = 'paused';
          inst.updatedAt = new Date().toISOString();
        }
      });

      if (stageResult.status === 'failed') {
        const failedTask = getStore().tasks.find(t => t.id === instance.taskId);
        if (failedTask) {
          mutateStore(s => {
            const t = s.tasks.find(x => x.id === instance.taskId);
            if (t) { t.status = 'Failed'; t.updatedAt = new Date().toISOString(); }
          });
        }
        publishPipelineEvent(instance, pipeline, stage, 'pipeline.failed', { reason: stageResult.output }, stageResult.agentId);
        return;
      }

      if (stageResult.status === 'pending') {
        return;
      }

      const nextStage = pipeline.stages[instance.currentStageIndex + 1];
      if (nextStage?.transition === 'manual') {
        mutateStore(s => {
          const inst = s.pipelineInstances.find(pi => pi.id === instanceId);
          if (inst) {
            inst.currentStageIndex += 1;
            inst.status = 'paused';
            inst.updatedAt = new Date().toISOString();
          }
        });
        logPipeline(instanceId, 'Pipeline Manual Pause', `Pipeline paused before stage "${nextStage.name}" (manual transition).`, 'info');
        return;
      }

      mutateStore(s => {
        const inst = s.pipelineInstances.find(pi => pi.id === instanceId);
        if (inst) inst.currentStageIndex += 1;
      });
    }

    mutateStore(s => {
      const inst = s.pipelineInstances.find(pi => pi.id === instanceId);
      if (inst) { inst.status = 'completed'; inst.completedAt = new Date().toISOString(); inst.updatedAt = new Date().toISOString(); }
    });

    const pipelineParentTask = getStore().tasks.find(t => t.id === instance.taskId);
    if (pipelineParentTask) {
      mutateStore(s => {
        const t = s.tasks.find(x => x.id === instance.taskId);
        if (t) { t.status = 'Done'; t.updatedAt = new Date().toISOString(); }
      });
    }

    const lastStage = pipeline.stages[pipeline.stages.length - 1];
    const lastStageResult = instance.stageResults[instance.stageResults.length - 1];
    publishPipelineEvent(instance, pipeline, lastStage, 'pipeline.completed', {}, lastStageResult?.agentId);
    logPipeline(instanceId, 'Pipeline Completed', `Pipeline "${pipeline.name}" finished all ${pipeline.stages.length} stages.`, 'success');

  } finally {
    runningInstances.delete(instanceId);
  }
}

export function startPipelineEngine(): void {
  setInterval(() => {
    const store = getStore();
    const pausedInstances = store.pipelineInstances.filter(pi => pi.status === 'paused');

    for (const instance of pausedInstances) {
      const latest = store.pipelineInstances.find(pi => pi.id === instance.id);
      if (!latest || latest.status !== 'paused') continue;

      const pipeline = store.pipelines.find(p => p.id === latest.pipelineId);
      if (!pipeline) continue;

      const currentStage = pipeline.stages[latest.currentStageIndex];
      if (!currentStage) {
        if (latest.currentStageIndex >= pipeline.stages.length) {
          mutateStore(s => {
            const inst = s.pipelineInstances.find(pi => pi.id === instance.id);
            if (inst) { inst.status = 'completed'; inst.completedAt = new Date().toISOString(); inst.updatedAt = new Date().toISOString(); }
          });
          logPipeline(instance.id, 'Pipeline Completed', `Pipeline completed (resumed after manual stage).`, 'success');
        }
        continue;
      }

      const stageResult = latest.stageResults[latest.stageResults.length - 1];

      if (stageResult?.status === 'completed' && currentStage.transition === 'manual') {
        mutateStore(s => {
          const inst = s.pipelineInstances.find(pi => pi.id === instance.id);
          if (inst) {
            inst.status = 'running';
            inst.updatedAt = new Date().toISOString();
          }
        });
        void runPipelineInstance(instance.id);
        continue;
      }

      if (!stageResult || stageResult.status !== 'pending') continue;

      const assignee = findAgentByRole(currentStage.assigneeRole, pipeline.workspaceId);
      if (!assignee) continue;

      const pipelineParentTask = store.tasks.find(t => t.id === instance.taskId);
      if (!pipelineParentTask) {
        mutateStore(s => {
          const inst = s.pipelineInstances.find(pi => pi.id === instance.id);
          if (inst) { inst.status = 'running'; inst.updatedAt = new Date().toISOString(); }
        });
        void runPipelineInstance(instance.id);
        continue;
      }

      if (pipelineParentTask.status === 'Done') {
        const stageSubtask = pipelineParentTask.subtasks.find(s => s.id === currentStage.id);
        if (stageSubtask?.completed) {
          mutateStore(s => {
            const inst = s.pipelineInstances.find(pi => pi.id === instance.id);
            if (inst) {
              const lastResult = inst.stageResults[inst.stageResults.length - 1];
              if (lastResult) { lastResult.status = 'completed'; lastResult.completedAt = new Date().toISOString(); }
              inst.currentStageIndex += 1;
              inst.status = 'running';
              inst.updatedAt = new Date().toISOString();
            }
          });
          void runPipelineInstance(instance.id);
        }
      } else if (pipelineParentTask.status === 'Failed' || pipelineParentTask.status === 'Blocked') {
        const reason = pipelineParentTask.status === 'Blocked' ? 'Stage blocked by approval' : 'Stage task failed';
        mutateStore(s => {
          const inst = s.pipelineInstances.find(pi => pi.id === instance.id);
          if (inst) {
            const lastResult = inst.stageResults[inst.stageResults.length - 1];
            if (lastResult) { lastResult.status = 'failed'; lastResult.output = reason; lastResult.completedAt = new Date().toISOString(); }
            inst.status = 'failed';
            inst.error = reason;
            inst.completedAt = new Date().toISOString();
          }
        });
        logPipeline(instance.id, 'Pipeline Failed', `Pipeline failed: ${reason}`, 'error');
      } else if (pipelineParentTask.status === 'In Progress') {
        const pendingApproval = store.approvals.find(a =>
          a.taskId === instance.taskId && a.status === 'pending'
        );
        if (!pendingApproval) {
          mutateStore(s => {
            const inst = s.pipelineInstances.find(pi => pi.id === instance.id);
            if (inst) { inst.status = 'running'; inst.updatedAt = new Date().toISOString(); }
          });
          logPipeline(instance.id, 'Pipeline Resumed', `Resuming after approval resolved (no pending approvals).`, 'info');
          void runPipelineInstance(instance.id);
        }
      }
    }
  }, 5000);

  console.log('[PipelineEngine] Manager initialized');
}

export function createPipelineInstance(
  pipelineId: string,
  taskId: string,
  workspaceId: string
): PipelineInstance {
  const instance: PipelineInstance = {
    id: crypto.randomUUID(),
    pipelineId,
    taskId,
    currentStageIndex: 0,
    status: 'running',
    stageResults: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  mutateStore(s => {
    s.pipelineInstances.unshift(instance);
  });

  logPipeline(instance.id, 'Pipeline Instance Created', `Pipeline instance created for task ${taskId}.`, 'info', { pipelineId, taskId });
  return instance;
}

export function cancelPipelineInstance(instanceId: string, reason?: string): boolean {
  let found = false;
  mutateStore(s => {
    const inst = s.pipelineInstances.find(pi => pi.id === instanceId);
    if (inst && (inst.status === 'running' || inst.status === 'paused')) {
      inst.status = 'cancelled';
      inst.error = reason || 'Cancelled by user';
      inst.completedAt = new Date().toISOString();
      inst.updatedAt = new Date().toISOString();
      found = true;
    }
  });
  if (found) {
    logPipeline(instanceId, 'Pipeline Cancelled', reason || 'Pipeline cancelled.', 'warning');
  }
  return found;
}

export function getPipelineInstanceStatus(instanceId: string) {
  const store = getStore();
  const instance = store.pipelineInstances.find(pi => pi.id === instanceId);
  if (!instance) return undefined;
  const pipeline = store.pipelines.find(p => p.id === instance.pipelineId);
  return { instance, pipeline };
}