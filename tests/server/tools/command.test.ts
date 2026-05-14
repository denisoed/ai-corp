import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockExecFile = vi.hoisted(() => vi.fn((...args: any[]) => {
  for (let i = args.length - 1; i >= 0; i--) {
    if (typeof args[i] === 'function') {
      args[i](null, { stdout: '', stderr: '' });
      return;
    }
  }
}));
vi.mock('child_process', () => ({ execFile: mockExecFile }));

const mockStore: any = {
  agents: [],
  workspaces: [],
  commandRuns: [],
  pipelines: [],
  pipelineInstances: [],
  logs: [],
};
vi.mock('../../../src/server/store', () => ({
  getStore: () => mockStore,
  mutateStore: (fn: (s: any) => void) => fn(mockStore),
  hasPermission: vi.fn((agentId: string, perm: string) => {
    const agent = mockStore.agents.find((a: any) => a.id === agentId);
    if (!agent) return false;
    return (agent.permissions || []).some((p: any) => p.type === perm);
  }),
}));

vi.mock('../../../src/server/workspace-guard', () => ({
  assertAgentInWorkspace: vi.fn((agentId: string) => {
    const agent = mockStore.agents.find((a: any) => a.id === agentId);
    const workspace = mockStore.workspaces.find((w: any) => w.id === agent?.workspaceId);
    return { agent, workspace };
  }),
}));

vi.mock('../../../src/server/task-autopilot', () => ({
  requestApproval: vi.fn().mockResolvedValue({ success: true, approvalId: 'mock-approval-id' }),
}));

import { handleRunCommand } from '../../../src/server/tools/command';

function setup(agentPermissions: string[]) {
  mockStore.agents = [{
    id: 'agent-test',
    name: 'Test Agent',
    workspaceId: 'ws-test',
    permissions: agentPermissions.map(t => ({ type: t, scope: 'all' })),
  }];
  mockStore.workspaces = [{
    id: 'ws-test',
    name: 'Test Workspace',
    slug: 'test',
    folderPath: '/tmp',
    settings: {
      commandExecution: {
        allowNetwork: false,
        enabled: true,
        dockerImage: 'alpine:latest',
      },
    },
  }];
  mockStore.commandRuns = [];
}

describe('handleRunCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setup(['system:run_commands']);
  });

  it('allows network command (npm install) when agent has system:run_commands', async () => {
    const result = await handleRunCommand({
      command: 'npm',
      args: ['install'],
      cwd: '.',
    }, 'agent-test');

    expect(result.success).toBe(true);
  }, 15000);

  it('allows destructive command when agent has system:run_commands', async () => {
    const result = await handleRunCommand({
      command: 'rm',
      args: ['-rf', '/tmp/test'],
      cwd: '.',
    }, 'agent-test');

    expect(result.success).toBe(true);
  }, 15000);

  it('returns permission error when agent lacks system:run_commands', async () => {
    setup(['file:read']);

    const result = await handleRunCommand({
      command: 'npm',
      args: ['install'],
      cwd: '.',
    }, 'agent-test');

    expect(result.success).toBe(false);
    expect(result.error).toContain('system:run_commands');
  });
});
