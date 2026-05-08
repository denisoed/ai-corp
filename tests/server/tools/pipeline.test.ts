import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import fs from 'fs';
import { handleCreatePipeline, handleStartPipeline, handleGetPipelineStatus, handlePlanPipeline, handleCancelPipeline } from '../../../src/server/tools/pipeline';
import type { Agent, Workspace, Task } from '../../../src/types';

const testDir = vi.hoisted(() => {
  const dir = `/tmp/aicorp-test-${Date.now()}`;
  process.env.AICORP_HOME = dir;
  return dir;
});

vi.mock('../../../src/server/store', async () => {
  const actual = await vi.importActual('../../../src/server/store') as any;
  const { resetDb } = await vi.importActual('../../../src/server/db') as any;
  resetDb();
  actual.loadStore();
  const storeModule = { ...actual, getStore: () => actual.getStore(), mutateStore: actual.mutateStore, loadStore: actual.loadStore, saveStore: actual.saveStore };
  return storeModule;
});

import { getStore, mutateStore } from '../../../src/server/store';
import { resetDb } from '../../../src/server/db';

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

afterAll(() => {
  try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {}
  delete process.env.AICORP_HOME;
});

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

describe('Pipeline Subtask Integration', () => {
  it('creates pipeline task with subtasks for each stage', () => {
    handleCreatePipeline({
      name: 'Subtask Test',
      description: 'Test',
      stages: [
        { name: 'Dev', assigneeRole: 'Developer', instructions: 'Build' },
        { name: 'Review', assigneeRole: 'Reviewer', instructions: 'Check' },
      ]
    }, 'agent-pm');

    mutateStore(s => {
      s.pipelineInstances.push({
        id: 'inst-sub',
        pipelineId: s.pipelines[0].id,
        taskId: 'task-1',
        currentStageIndex: 0,
        status: 'running',
        stageResults: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    });

    const task = getStore().tasks.find(t => t.tags?.includes('pipeline-instance:inst-sub'));
    expect(task).toBeUndefined();
  });

  it('marks parent task as Done when pipeline completes', () => {
    mutateStore(s => {
      s.pipelineInstances.push({
        id: 'inst-complete',
        pipelineId: 'pipeline-1',
        taskId: 'task-1',
        currentStageIndex: 2,
        status: 'running',
        stageResults: [
          { stageId: 's1', status: 'completed', startedAt: new Date().toISOString(), completedAt: new Date().toISOString() },
          { stageId: 's2', status: 'completed', startedAt: new Date().toISOString(), completedAt: new Date().toISOString() },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    });

    const task = getStore().tasks.find(t => t.id === 'task-1');
    expect(task).toBeDefined();
  });
});

describe('Pipeline Types', () => {
  it('store has pipelineInstances array', () => {
    const store = getStore();
    expect(store.pipelineInstances).toBeDefined();
    expect(Array.isArray(store.pipelineInstances)).toBe(true);
  });
});