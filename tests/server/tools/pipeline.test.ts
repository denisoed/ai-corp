import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleCreatePipeline, handleStartPipeline, handleGetPipelineStatus, handlePlanPipeline, handleCancelPipeline } from '../../../src/server/tools/pipeline';
import { getStore, mutateStore, loadStore, saveStore } from '../../../src/server/store';
import type { Agent, Workspace, Task } from '../../../src/types';

vi.mock('../../../src/server/store', async () => {
  const actual = await vi.importActual('../../../src/server/store');
  return {
    ...actual,
    getStore: () => (actual as any).getStore(),
    mutateStore: (actual as any).mutateStore,
    loadStore: (actual as any).loadStore,
    saveStore: (actual as any).saveStore,
  };
});

function createTestWorkspace() {
  mutateStore(s => {
    s.workspaces = [{
      id: 'ws-test',
      name: 'Test Workspace',
      slug: 'test',
      description: 'Test',
      agentIds: ['agent-pm', 'agent-dev', 'agent-reviewer'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }];
    s.agents = [
      {
        id: 'agent-pm',
        name: 'PM',
        slug: 'pm',
        role: 'Manager' as const,
        status: 'Idle' as const,
        skills: [],
        workspaceId: 'ws-test',
      },
      {
        id: 'agent-dev',
        name: 'Developer',
        slug: 'developer',
        role: 'Developer' as const,
        status: 'Idle' as const,
        skills: [],
        workspaceId: 'ws-test',
      },
      {
        id: 'agent-reviewer',
        name: 'Reviewer',
        slug: 'reviewer',
        role: 'Reviewer' as const,
        status: 'Idle' as const,
        skills: [],
        workspaceId: 'ws-test',
      },
    ];
    s.tasks = [{
      id: 'task-1',
      title: 'Test Task',
      description: 'Test task description',
      status: 'Backlog' as const,
      priority: 'High' as const,
      risk: 'medium' as const,
      cost: 0,
      creatorId: 'agent-pm',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      comments: [],
      tags: [],
      subtasks: [],
    }];
    s.pipelines = [];
    s.pipelineInstances = [];
  });
}

describe('Pipeline Tools', () => {
  beforeEach(() => {
    createTestWorkspace();
  });

  describe('handleCreatePipeline', () => {
    it('creates a pipeline with valid stages', () => {
      const result = handleCreatePipeline({
        name: 'Test Pipeline',
        description: 'Test pipeline description',
        stages: [
          { name: 'Stage 1', assigneeRole: 'Developer', instructions: 'Do something' },
          { name: 'Stage 2', assigneeRole: 'Reviewer', instructions: 'Review it', transition: 'approval_required' },
        ]
      }, 'agent-pm');

      expect(result.success).toBe(true);
      expect(result.pipeline).toBeDefined();
      expect(result.pipeline!.name).toBe('Test Pipeline');
      expect(result.pipeline!.stages).toHaveLength(2);
      expect(result.pipeline!.stages[0].name).toBe('Stage 1');
      expect(result.pipeline!.stages[0].assigneeRole).toBe('Developer');
      expect(result.pipeline!.stages[1].transition).toBe('approval_required');
    });

    it('rejects pipeline without name', () => {
      const result = handleCreatePipeline({
        stages: [{ name: 'Stage', assigneeRole: 'Developer', instructions: 'Do' }]
      }, 'agent-pm');

      expect(result.success).toBe(false);
      expect(result.error).toContain('name');
    });

    it('rejects pipeline without stages', () => {
      const result = handleCreatePipeline({
        name: 'Empty Pipeline'
      }, 'agent-pm');

      expect(result.success).toBe(false);
      expect(result.error).toContain('stage');
    });

    it('rejects pipeline with empty stages array', () => {
      const result = handleCreatePipeline({
        name: 'Empty Stages',
        stages: []
      }, 'agent-pm');

      expect(result.success).toBe(false);
    });
  });

  describe('handleGetPipelineStatus', () => {
    it('returns pipeline status by instanceId', () => {
      handleCreatePipeline({
        name: 'Status Test Pipeline',
        stages: [{ name: 'S1', assigneeRole: 'Developer', instructions: 'Do' }]
      }, 'agent-pm');

      const pipeline = getStore().pipelines[0];

      mutateStore(s => {
        s.pipelineInstances.push({
          id: 'inst-1',
          pipelineId: pipeline.id,
          taskId: 'task-1',
          currentStageIndex: 0,
          status: 'running',
          stageResults: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      });

      const result = handleGetPipelineStatus({ instanceId: 'inst-1' }, 'agent-pm');

      expect(result.success).toBe(true);
      expect(result.instance).toBeDefined();
      expect(result.instance!.id).toBe('inst-1');
      expect(result.instance!.status).toBe('running');
    });

    it('returns all pipelines for agent workspace', () => {
      const result = handleGetPipelineStatus({}, 'agent-pm');

      expect(result.success).toBe(true);
      expect(result.pipeline).toBeDefined();
      expect(Array.isArray(result.pipeline)).toBe(true);
    });
  });

  describe('handlePlanPipeline', () => {
    it('returns suggested pipeline stages for a task', () => {
      const result = handlePlanPipeline({ taskTitle: 'Test Task' }, 'agent-pm');

      expect(result.success).toBe(true);
      expect(result.stages).toBeDefined();
      expect(result.stages!.length).toBeGreaterThan(0);

      const stage = result.stages![0];
      expect(stage.name).toBeDefined();
      expect(stage.assigneeRole).toBeDefined();
      expect(stage.instructions).toContain('Test Task');
    });

    it('fails for non-existent task', () => {
      const result = handlePlanPipeline({ taskTitle: 'Non Existent Task' }, 'agent-pm');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('handleCancelPipeline', () => {
    it('cancels a running pipeline instance', () => {
      handleCreatePipeline({
        name: 'Cancel Test',
        stages: [{ name: 'S1', assigneeRole: 'Developer', instructions: 'Do' }]
      }, 'agent-pm');

      const pipeline = getStore().pipelines[0];

      mutateStore(s => {
        s.pipelineInstances.push({
          id: 'inst-cancel',
          pipelineId: pipeline.id,
          taskId: 'task-1',
          currentStageIndex: 0,
          status: 'running',
          stageResults: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      });

      const result = handleCancelPipeline({ instanceId: 'inst-cancel', reason: 'Test cancel' }, 'agent-pm');

      expect(result.success).toBe(true);

      const inst = getStore().pipelineInstances.find(pi => pi.id === 'inst-cancel');
      expect(inst!.status).toBe('cancelled');
      expect(inst!.error).toBe('Test cancel');
    });

    it('fails for non-existent instance', () => {
      const result = handleCancelPipeline({ instanceId: 'non-existent' }, 'agent-pm');

      expect(result.success).toBe(false);
    });
  });
});

describe('Pipeline Types', () => {
  it('store has pipelineInstances array', () => {
    const store = getStore();
    expect(store.pipelineInstances).toBeDefined();
    expect(Array.isArray(store.pipelineInstances)).toBe(true);
  });
});