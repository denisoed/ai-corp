import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import fs from 'fs';

const testDir = vi.hoisted(() => {
  const dir = `/tmp/aicorp-pipeline-test-${Date.now()}`;
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

vi.mock('../../src/server/llm', () => ({
  createChatSession: vi.fn(() => ({
    sendMessage: vi.fn().mockResolvedValue({
      text: 'Running command',
      toolCalls: [{
        function: {
          name: 'run_command',
          arguments: JSON.stringify({ command: 'npm', args: ['install'], cwd: '.' }),
        },
      }],
    }),
    sendToolResults: vi.fn().mockResolvedValue({
      text: 'Command needs approval',
      toolCalls: [],
    }),
    getMessages: vi.fn(() => []),
  })),
}));

vi.mock('../../src/server/agent-memory', () => ({
  loadMemory: vi.fn(() => null),
  buildSystemPrompt: vi.fn(() => 'system prompt'),
  appendMessage: vi.fn(),
}));

vi.mock('../../src/server/events', () => ({
  publishEvent: vi.fn(),
}));

vi.mock('../../src/server/tools/index', () => ({
  executeTool: vi.fn().mockResolvedValue({
    success: false,
    status: 'needs_approval',
    reason: 'Network command requires approval',
  }),
}));

import { getStore, mutateStore } from '../../src/server/store';
import { resetDb } from '../../src/server/db';
import { runPipelineInstance, createPipelineInstance } from '../../src/server/pipeline-engine';

beforeEach(() => {
  const store = getStore();
  store.workspaces = [{
    id: 'ws-test',
    name: 'Test',
    slug: 'test',
    description: '',
    agentIds: ['agent-dev'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }];
  store.agents = [{
    id: 'agent-dev',
    name: 'Developer',
    slug: 'developer',
    role: 'Developer' as const,
    status: 'Idle' as const,
    skills: [],
    workspaceId: 'ws-test',
  }];
  store.tasks = [{
    id: 'task-1',
    title: 'Test Task',
    description: 'Test',
    status: 'Backlog' as const,
    priority: 'Medium' as const,
    risk: 'low' as const,
    cost: 0,
    creatorId: 'agent-dev',
    tags: [],
    comments: [],
    subtasks: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }];
});

afterAll(() => {
  try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {}
  delete process.env.AICORP_HOME;
});

describe('pipeline-engine needs_approval handling', () => {
  beforeEach(() => {
    const store = getStore();
    store.pipelines = [{
      id: 'pipeline-1',
      name: 'Test Pipeline',
      workspaceId: 'ws-test',
      stages: [{
        id: 'stage-1',
        name: 'Development',
        order: 0,
        assigneeRole: 'Developer',
        instructions: 'Build the feature',
        transition: 'auto' as const,
      }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }];
    store.pipelineInstances = [];
  });

  it('pauses pipeline stage when run_command returns needs_approval', async () => {
    const store = getStore();

    const instance = createPipelineInstance('pipeline-1', 'task-1', 'ws-test');
    expect(instance.status).toBe('running');

    await runPipelineInstance(instance.id);

    const updated = getStore().pipelineInstances.find(pi => pi.id === instance.id);
    expect(updated?.status).toBe('paused');

    const lastResult = updated?.stageResults[updated.stageResults.length - 1];
    expect(lastResult?.status).toBe('pending');
    expect(lastResult?.comments.join('')).toContain('awaiting approval');
  }, 10000);
});
