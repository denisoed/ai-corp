import { Router } from 'express';
import { getStore, mutateStore } from '../store';
import { createPipelineInstance, runPipelineInstance, cancelPipelineInstance, getPipelineInstanceStatus } from '../pipeline-engine';
import type { Pipeline, PipelineStage, AgentRole } from '../../types';

const router = Router();

function findAgent(agentId: string) {
  const agent = getStore().agents.find(a => a.id === agentId);
  if (!agent) return undefined;
  return agent;
}

function requireAgent(agentId: string) {
  const agent = findAgent(agentId);
  if (!agent) return { error: 'Agent not found', status: 400 };
  return { agent };
}

function requireWorkspaceId(agentId: string) {
  const agent = findAgent(agentId);
  if (!agent) return undefined;
  return agent.workspaceId;
}

router.get('/pipelines', (req, res) => {
  const workspaceId = req.query.workspaceId as string | undefined;
  const agentId = req.query.agentId as string | undefined;
  let pipelines = getStore().pipelines;
  if (workspaceId) {
    pipelines = pipelines.filter(p => p.workspaceId === workspaceId);
  } else if (agentId) {
    const wsId = requireWorkspaceId(agentId);
    if (!wsId) return res.status(400).json({ error: 'Agent not found' });
    pipelines = pipelines.filter(p => p.workspaceId === wsId);
  }
  const result = pipelines.map(p => ({
    ...p,
    instanceCount: getStore().pipelineInstances.filter(pi => pi.pipelineId === p.id).length,
    activeInstanceCount: getStore().pipelineInstances.filter(pi => pi.pipelineId === p.id && (pi.status === 'running' || pi.status === 'paused')).length,
  }));
  res.json(result);
});

router.get('/pipelines/:id', (req, res) => {
  const pipeline = getStore().pipelines.find(p => p.id === req.params.id);
  if (!pipeline) return res.status(404).json({ error: 'Pipeline not found' });
  const instances = getStore().pipelineInstances.filter(pi => pi.pipelineId === pipeline.id);
  res.json({ pipeline, instances });
});

router.post('/pipelines', (req, res) => {
  const { name, description, stages, agentId } = req.body;
  if (!name || !stages || !Array.isArray(stages) || stages.length === 0) {
    return res.status(400).json({ error: 'Pipeline requires a name and at least one stage' });
  }
  const wsId = requireWorkspaceId(agentId);
  if (!wsId) return res.status(400).json({ error: 'Agent not found' });

  const pipelineStages: PipelineStage[] = stages.map((s: any, idx: number) => ({
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
    name,
    description,
    workspaceId: wsId,
    stages: pipelineStages,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  mutateStore(s => {
    s.pipelines.unshift(pipeline);
  });

  res.json(pipeline);
});

router.delete('/pipelines/:id', (req, res) => {
  const pipeline = getStore().pipelines.find(p => p.id === req.params.id);
  if (!pipeline) return res.status(404).json({ error: 'Pipeline not found' });

  mutateStore(s => {
    s.pipelines = s.pipelines.filter(p => p.id !== req.params.id);
    s.pipelineInstances = s.pipelineInstances.filter(pi => pi.pipelineId !== req.params.id);
  });

  const tasksToRemove = getStore().tasks.filter(t =>
    t.tags?.includes(`pipeline:${req.params.id}`)
  );
  if (tasksToRemove.length > 0) {
    const taskIds = new Set(tasksToRemove.map(t => t.id));
    mutateStore(s => {
      s.tasks = s.tasks.filter(t => !taskIds.has(t.id));
    });
  }

  res.json({ success: true });
});

router.post('/instances/cancel-all', (req, res) => {
  const { workspaceId } = req.body;
  mutateStore(s => {
    for (const inst of s.pipelineInstances) {
      if (workspaceId) {
        const p = s.pipelines.find(p => p.id === inst.pipelineId);
        if (p?.workspaceId !== workspaceId) continue;
      }
      if (inst.status === 'running' || inst.status === 'paused') {
        inst.status = 'cancelled';
        inst.error = 'Cancelled by user (batch)';
        inst.completedAt = new Date().toISOString();
        inst.updatedAt = new Date().toISOString();
      }
    }
  });
  res.json({ success: true });
});

router.post('/pipelines/:id/start', async (req, res) => {
  const pipeline = getStore().pipelines.find(p => p.id === req.params.id);
  if (!pipeline) return res.status(404).json({ error: 'Pipeline not found' });

  const { taskId, agentId } = req.body;
  if (!taskId || !agentId) return res.status(400).json({ error: 'taskId and agentId required' });

  const agent = findAgent(agentId);
  if (!agent) return res.status(400).json({ error: 'Agent not found' });

  const task = getStore().tasks.find(t => t.id === taskId);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  if (pipeline.workspaceId !== agent.workspaceId) {
    return res.status(400).json({ error: 'Pipeline belongs to a different workspace' });
  }

  const existingFailed = getStore().pipelineInstances.find(pi =>
    pi.pipelineId === pipeline.id &&
    pi.taskId === taskId &&
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
    return res.json({ instance: existingFailed });
  }

  mutateStore(s => {
    const t = s.tasks.find(x => x.id === task.id);
    if (t && !t.tags.includes(`pipeline:${pipeline.id}`)) {
      t.tags.push(`pipeline:${pipeline.id}`);
    }
  });

  const instance = createPipelineInstance(pipeline.id, task.id, agent.workspaceId);
  void runPipelineInstance(instance.id);

  res.json({ instance });
});

router.post('/pipelines/:id/resume', async (req, res) => {
  const pipeline = getStore().pipelines.find(p => p.id === req.params.id);
  if (!pipeline) return res.status(404).json({ error: 'Pipeline not found' });

  const { instanceId } = req.body;
  if (!instanceId) return res.status(400).json({ error: 'instanceId required' });

  const instance = getStore().pipelineInstances.find(pi => pi.id === instanceId);
  if (!instance) return res.status(404).json({ error: 'Pipeline instance not found' });
  if (instance.status !== 'paused') return res.status(400).json({ error: 'Instance is not paused' });

  mutateStore(s => {
    const inst = s.pipelineInstances.find(pi => pi.id === instanceId);
    if (inst) { inst.status = 'running'; inst.updatedAt = new Date().toISOString(); }
  });

  void runPipelineInstance(instanceId);
  res.json({ success: true });
});

function getInstanceStatus(instanceId: string) {
  const instance = getStore().pipelineInstances.find(pi => pi.id === instanceId);
  if (!instance) return undefined;
  const pipeline = getStore().pipelines.find(p => p.id === instance.pipelineId);
  const currentStage = pipeline ? pipeline.stages[instance.currentStageIndex] : undefined;
  return { instance, pipeline, currentStage };
}

router.get('/instances', (req, res) => {
  const pipelineId = req.query.pipelineId as string | undefined;
  const workspaceId = req.query.workspaceId as string | undefined;
  let instances = getStore().pipelineInstances;
  if (pipelineId) {
    instances = instances.filter(pi => pi.pipelineId === pipelineId);
  }
  if (workspaceId) {
    const pipelineIds = new Set(getStore().pipelines.filter(p => p.workspaceId === workspaceId).map(p => p.id));
    instances = instances.filter(pi => pipelineIds.has(pi.pipelineId));
  }
  const result = instances.map(inst => {
    const pipeline = getStore().pipelines.find(p => p.id === inst.pipelineId);
    const currentStage = pipeline ? pipeline.stages[inst.currentStageIndex] : undefined;
    return { ...inst, pipelineName: pipeline?.name, currentStageName: currentStage?.name };
  });
  res.json(result);
});

router.get('/instances/:id', (req, res) => {
  const data = getInstanceStatus(req.params.id);
  if (!data) return res.status(404).json({ error: 'Pipeline instance not found' });
  res.json(data);
});

router.post('/instances/:id/cancel', (req, res) => {
  const { reason } = req.body;
  const cancelled = cancelPipelineInstance(req.params.id, reason);
  if (!cancelled) return res.status(400).json({ error: 'Could not cancel pipeline instance' });
  res.json({ success: true });
});

router.get('/plan', (req, res) => {
  const { taskTitle, taskId, agentId } = req.query;
  if (!agentId) return res.status(400).json({ error: 'agentId required' });

  const agent = findAgent(agentId as string);
  if (!agent) return res.status(400).json({ error: 'Agent not found' });

  const task = taskId
    ? getStore().tasks.find(t => t.id === taskId)
    : taskTitle
      ? getStore().tasks.find(t => t.title.toLowerCase().includes((taskTitle as string).toLowerCase()))
      : undefined;
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const availableRoles = getStore().agents
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
  res.json({ stages: stages.length > 0 ? stages : defaultStages.slice(0, 2) });
});

export default router;