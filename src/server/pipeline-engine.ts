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

function findOrCreatePipelineTask(instance: PipelineInstance, pipeline: Pipeline): Task {
  const store = getStore();
  const parentTask = store.tasks.find(t => t.id === instance.taskId);
  let pipelineTask = store.tasks.find(t => t.tags?.includes(`pipeline-instance:${instance.id}`));

  if (!pipelineTask) {
    pipelineTask = {
      id: crypto.randomUUID(),
      title: `[Pipeline] ${pipeline.name}`,
      description: parentTask
        ? `${parentTask.description}\n\n---\nPipeline: ${pipeline.name}\n${pipeline.stages.map((s, i) => `${i + 1}. ${s.name} (${s.assigneeRole})`).join('\n')}`
        : `Pipeline: ${pipeline.name}\n${pipeline.stages.map((s, i) => `${i + 1}. ${s.name} (${s.assigneeRole})`).join('\n')}`,
      status: 'In Progress' as const,
      priority: 'High' as const,
      risk: 'medium' as const,
      cost: 0,
      assigneeId: '',
      creatorId: 'pipeline-engine',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      comments: [],
      tags: [`pipeline-instance:${instance.id}`],
      subtasks: pipeline.stages.map(s => ({
        id: s.id,
        title: `${s.name} (${s.assigneeRole})`,
        completed: false,
      })),
    };

    mutateStore(s => {
      s.tasks.unshift(pipelineTask!);
    });
  }

  return pipelineTask;
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
  const pipelineTask = store.tasks.find(t => t.tags?.includes(`pipeline-instance:${instance.id}`));

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
      stageTaskId: pipelineTask?.id,
      ...extra,
    }
  }, stageAgentId || pipelineTask?.assigneeId);
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

  const pipelineTask = findOrCreatePipelineTask(instance, pipeline);
  mutateStore(s => {
    const t = s.tasks.find(x => x.id === pipelineTask.id);
    if (t) {
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
    const systemPrompt = buildSystemPrompt(agent) + '\n\n' + [
      `You are executing stage "${stage.name}" of pipeline "${pipeline.name}".`,
      stage.instructions,
      stage.expectedOutput ? `Expected output: ${stage.expectedOutput}` : '',
      task ? `Parent task context:\nTitle: ${task.title}\nDescription: ${task.description}` : '',
      '',
      'Operating rules for pipeline stage:',
      '- Work on the stage task until it reaches Done.',
      '- Use tools to accomplish the stage goal.',
      '- If you need approval, call request_approval with approverAgentName set to a relevant agent (e.g., "Manager" for decisions, "Reviewer" for code review, "DevOps" for deployment). Do NOT ask humans unless no other agent is available.',
      '- When complete, move the task to Done and write a summary comment.',
    ].filter(Boolean).join('\n');

    const chatSession = createChatSession(agent, systemPrompt);
    let response = await chatSession.sendMessage(`Execute stage "${stage.name}" of pipeline "${pipeline.name}". Goal: ${stage.instructions}`);

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
          result.status = 'pending';
          result.comments.push('Stage paused: awaiting approval.');
          logPipeline(instance.id, 'Pipeline Stage Waiting Approval', `Stage "${stage.name}" waiting for approval.`, 'warning');
          return result;
        }
      }

      const updatedTask = getStore().tasks.find(t => t.id === pipelineTask.id);
      if (updatedTask?.status === 'Done') {
        result.status = 'completed';
        result.output = response.text?.trim() || 'Stage completed.';
        result.completedAt = new Date().toISOString();
        result.comments.push(response.text?.trim() || 'Stage completed.');
        mutateStore(s => {
          const t = s.tasks.find(x => x.id === pipelineTask.id);
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

    const finalTask = getStore().tasks.find(t => t.id === pipelineTask.id);
    if (!result.completedAt) {
      if (finalTask?.status === 'Done') {
        result.status = 'completed';
        result.output = response.text?.trim() || 'Stage completed.';
        result.completedAt = new Date().toISOString();
        mutateStore(s => {
          const t = s.tasks.find(x => x.id === pipelineTask.id);
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
        inst.stageResults.push(stageResult);
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

    const task = getStore().tasks.find(t => t.id === instance.taskId);
    if (task) {
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

      const pipelineTask = store.tasks.find(t => t.tags?.includes(`pipeline-instance:${instance.id}`));
      if (!pipelineTask) {
        mutateStore(s => {
          const inst = s.pipelineInstances.find(pi => pi.id === instance.id);
          if (inst) { inst.status = 'running'; inst.updatedAt = new Date().toISOString(); }
        });
        void runPipelineInstance(instance.id);
        continue;
      }

      if (pipelineTask.status === 'Done') {
        const stageSubtask = pipelineTask.subtasks.find(s => s.id === currentStage.id);
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
      } else if (pipelineTask.status === 'Failed' || pipelineTask.status === 'Blocked') {
        const reason = pipelineTask.status === 'Blocked' ? 'Stage blocked by approval' : 'Stage task failed';
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