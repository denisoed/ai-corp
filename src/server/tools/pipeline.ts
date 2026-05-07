import { getStore, mutateStore } from '../store';
import { Pipeline, PipelineStage, PipelineInstance, AgentRole } from '../../types';
import { runPipelineInstance, createPipelineInstance, cancelPipelineInstance } from '../pipeline-engine';

export function handleCreatePipeline(args: any, agentId: string): { success: boolean; pipeline?: Pipeline; error?: string } {
  const store = getStore();
  const agent = store.agents.find(a => a.id === agentId);
  if (!agent) return { success: false, error: 'Agent not found' };

  if (!args.name || !args.stages || !Array.isArray(args.stages) || args.stages.length === 0) {
    return { success: false, error: 'Pipeline requires a name and at least one stage' };
  }

  const stages: PipelineStage[] = args.stages.map((s: any, idx: number) => ({
    id: crypto.randomUUID(),
    name: s.name || `Stage ${idx + 1}`,
    order: idx,
    assigneeRole: (s.assigneeRole as AgentRole) || 'Developer',
    instructions: s.instructions || s.name || `Execute stage ${idx + 1}`,
    expectedOutput: s.expectedOutput,
    transition: s.transition || 'auto',
    timeoutMinutes: s.timeoutMinutes,
  }));

  const pipeline: Pipeline = {
    id: crypto.randomUUID(),
    name: args.name,
    description: args.description,
    workspaceId: agent.workspaceId,
    stages,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  mutateStore(s => {
    s.pipelines.unshift(pipeline);
  });

  return { success: true, pipeline };
}

export function handleStartPipeline(args: any, agentId: string): { success: boolean; instance?: PipelineInstance; error?: string } {
  const store = getStore();
  const agent = store.agents.find(a => a.id === agentId);
  if (!agent) return { success: false, error: 'Agent not found' };

  const task = args.taskId
    ? store.tasks.find(t => t.id === args.taskId)
    : args.taskTitle
      ? store.tasks.find(t => t.title.toLowerCase().includes(args.taskTitle.toLowerCase()))
      : undefined;
  if (!task) return { success: false, error: `Task "${args.taskTitle || args.taskId || 'unknown'}" not found` };

  const pipeline = args.pipelineId
    ? store.pipelines.find(p => p.id === args.pipelineId)
    : args.pipelineName
      ? store.pipelines.find(p => p.name.toLowerCase().includes(args.pipelineName.toLowerCase()))
      : undefined;
  if (!pipeline) return { success: false, error: `Pipeline "${args.pipelineName || args.pipelineId || 'unknown'}" not found` };

  if (pipeline.workspaceId !== agent.workspaceId) {
    return { success: false, error: 'Pipeline belongs to a different workspace' };
  }

  const existingFailed = store.pipelineInstances.find(pi =>
    pi.pipelineId === pipeline.id &&
    pi.taskId === task.id &&
    (pi.status === 'failed' || pi.status === 'cancelled')
  );

  if (existingFailed) {
    mutateStore(s => {
      const inst = s.pipelineInstances.find(pi => pi.id === existingFailed.id);
      if (inst) {
        inst.status = 'running';
        inst.currentStageIndex = 0;
        inst.stageResults = [];
        inst.error = undefined;
        inst.completedAt = undefined;
        inst.updatedAt = new Date().toISOString();
      }
    });
    void runPipelineInstance(existingFailed.id);
    return { success: true, instance: existingFailed };
  }

  const instance = createPipelineInstance(pipeline.id, task.id, agent.workspaceId);

  void runPipelineInstance(instance.id);

  return { success: true, instance };
}

export function handleGetPipelineStatus(args: any, agentId: string): { success: boolean; instance?: any; pipeline?: any; error?: string } {
  const store = getStore();

  if (args.instanceId) {
    const instance = store.pipelineInstances.find(pi => pi.id === args.instanceId);
    if (!instance) return { success: false, error: 'Pipeline instance not found' };
    const pipeline = store.pipelines.find(p => p.id === instance.pipelineId);
    return { success: true, instance, pipeline };
  }

  if (args.pipelineId) {
    const pipeline = store.pipelines.find(p => p.id === args.pipelineId);
    if (!pipeline) return { success: false, error: 'Pipeline not found' };
    const instances = store.pipelineInstances.filter(pi => pi.pipelineId === pipeline.id);
    return { success: true, pipeline, instance: instances };
  }

  const agent = store.agents.find(a => a.id === agentId);
  if (!agent) return { success: false, error: 'Agent not found' };

  const pipelines = store.pipelines.filter(p => p.workspaceId === agent.workspaceId);
  const instances = store.pipelineInstances.filter(pi => {
    const p = store.pipelines.find(p => p.id === pi.pipelineId);
    return p?.workspaceId === agent.workspaceId;
  });

  return { success: true, pipeline: pipelines, instance: instances };
}

export function handleCancelPipeline(args: any, agentId: string): { success: boolean; error?: string } {
  if (!args.instanceId) return { success: false, error: 'instanceId is required' };

  const store = getStore();
  const agent = store.agents.find(a => a.id === agentId);
  if (!agent) return { success: false, error: 'Agent not found' };

  const instance = store.pipelineInstances.find(pi => pi.id === args.instanceId);
  if (!instance) return { success: false, error: 'Pipeline instance not found' };

  const pipeline = store.pipelines.find(p => p.id === instance.pipelineId);
  if (pipeline && pipeline.workspaceId !== agent.workspaceId) {
    return { success: false, error: 'Pipeline belongs to a different workspace' };
  }

  const cancelled = cancelPipelineInstance(args.instanceId, args.reason);
  return cancelled ? { success: true } : { success: false, error: 'Could not cancel pipeline' };
}

export function handleDeletePipeline(args: any, agentId: string): { success: boolean; error?: string } {
  if (!args.pipelineId) return { success: false, error: 'pipelineId is required' };

  const store = getStore();
  const agent = store.agents.find(a => a.id === agentId);
  if (!agent) return { success: false, error: 'Agent not found' };

  const pipeline = store.pipelines.find(p => p.id === args.pipelineId);
  if (!pipeline) return { success: false, error: 'Pipeline not found' };

  if (pipeline.workspaceId !== agent.workspaceId) {
    return { success: false, error: 'Pipeline belongs to a different workspace' };
  }

  const activeInstances = store.pipelineInstances.filter(pi => pi.pipelineId === pipeline.id && (pi.status === 'running' || pi.status === 'paused'));
  if (activeInstances.length > 0) {
    return { success: false, error: 'Cannot delete pipeline with active instances' };
  }

  mutateStore(s => {
    s.pipelines = s.pipelines.filter(p => p.id !== args.pipelineId);
    s.pipelineInstances = s.pipelineInstances.filter(pi => pi.pipelineId !== args.pipelineId);
  });

  return { success: true };
}

export function handleListPipelines(args: any, agentId: string): { success: boolean; pipelines?: any; error?: string } {
  const store = getStore();
  const agent = store.agents.find(a => a.id === agentId);
  if (!agent) return { success: false, error: 'Agent not found' };

  const pipelines = store.pipelines
    .filter(p => p.workspaceId === agent.workspaceId)
    .map(p => {
      const instances = store.pipelineInstances.filter(pi => pi.pipelineId === p.id);
      return { ...p, instanceCount: instances.length };
    });

  return { success: true, pipelines };
}

export function handlePlanPipeline(args: any, agentId: string): { success: boolean; stages?: PipelineStage[]; error?: string } {
  const store = getStore();
  const agent = store.agents.find(a => a.id === agentId);
  if (!agent) return { success: false, error: 'Agent not found' };

  const task = args.taskId
    ? store.tasks.find(t => t.id === args.taskId)
    : args.taskTitle
      ? store.tasks.find(t => t.title.toLowerCase().includes(args.taskTitle.toLowerCase()))
      : undefined;
  if (!task) return { success: false, error: `Task "${args.taskTitle || args.taskId || 'unknown'}" not found` };

  const availableRoles = store.agents
    .filter(a => a.workspaceId === agent.workspaceId && a.status !== 'Offline')
    .map(a => a.role)
    .filter(Boolean);

  const roleSet = [...new Set(availableRoles)] as AgentRole[];

  const defaultStages: PipelineStage[] = [
    { id: crypto.randomUUID(), name: 'Research', order: 0, assigneeRole: 'Research', instructions: `Research and gather information for task: ${task.title}. ${task.description}`, transition: 'auto' },
    { id: crypto.randomUUID(), name: 'Implementation', order: 1, assigneeRole: 'Developer', instructions: `Implement the solution for: ${task.title}. ${task.description}`, transition: 'auto' },
    { id: crypto.randomUUID(), name: 'Review', order: 2, assigneeRole: 'Reviewer', instructions: `Review the implementation of task: ${task.title}`, expectedOutput: 'Code review findings', transition: 'approval_required' },
    { id: crypto.randomUUID(), name: 'QA', order: 3, assigneeRole: 'Developer', instructions: `Run tests and quality checks for: ${task.title}`, expectedOutput: 'Test results', transition: 'auto' },
    { id: crypto.randomUUID(), name: 'Deploy', order: 4, assigneeRole: 'DevOps', instructions: `Deploy the completed task: ${task.title}`, expectedOutput: 'Deployment confirmation', transition: 'manual' },
  ];

  const stages = defaultStages.filter(s => roleSet.includes(s.assigneeRole));

  return { success: true, stages: stages.length > 0 ? stages : defaultStages.slice(0, 2) };
}