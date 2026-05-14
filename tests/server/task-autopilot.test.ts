import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockStore: any = {
  agents: [],
  tasks: [],
  workspaces: [],
  approvals: [],
  subscriptions: [],
  logs: [],
  roles: [],
  messages: [],
  pipelines: [],
  pipelineInstances: [],
};

vi.mock('../../src/server/store', () => ({
  getStore: () => mockStore,
  mutateStore: (fn: (s: any) => void) => fn(mockStore),
  getEffectivePermissions: (agentId: string) => {
    const agent = mockStore.agents.find((a: any) => a.id === agentId);
    if (!agent) return [];
    const rolePerms = (agent.roleIds || []).flatMap((roleId: string) => {
      const role = mockStore.roles?.find((r: any) => r.id === roleId);
      return role?.permissions || [];
    });
    return [...rolePerms, ...(agent.permissions || [])];
  },
}));

vi.mock('../../src/server/events', () => ({
  publishEvent: vi.fn(),
  createApprovalRequestedEvent: vi.fn(() => ({})),
}));

vi.mock('../../src/server/agent-memory', () => ({
  buildSystemPrompt: vi.fn(() => 'system prompt'),
  loadMemory: vi.fn(() => null),
  appendMessage: vi.fn(),
}));

import { requestApproval } from '../../src/server/task-autopilot';

function resetStore() {
  mockStore.agents = [];
  mockStore.tasks = [];
  mockStore.workspaces = [];
  mockStore.approvals = [];
  mockStore.subscriptions = [];
  mockStore.logs = [];
  mockStore.roles = [];
  mockStore.messages = [];
  mockStore.pipelines = [];
  mockStore.pipelineInstances = [];
}

describe('requestApproval — permission security', () => {
  beforeEach(() => {
    resetStore();
    mockStore.agents.push({
      id: 'agent-dev',
      name: 'Developer',
      role: 'Developer',
      status: 'Idle',
      workspaceId: 'ws-1',
      permissions: [],
    });
    mockStore.agents.push({
      id: 'agent-pm',
      name: 'PM',
      role: 'Manager',
      status: 'Idle',
      workspaceId: 'ws-1',
      permissions: [],
    });
    mockStore.tasks.push({
      id: 'task-1',
      title: 'Test Task',
      description: 'A test task',
      status: 'In Progress',
      priority: 'High',
      risk: 'low',
      tags: [],
      comments: [],
      subtasks: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    mockStore.workspaces.push({
      id: 'ws-1',
      name: 'Test Workspace',
      slug: 'test',
      agentIds: ['agent-dev', 'agent-pm'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  it('rejects system:manage_permissions request', async () => {
    const result = await requestApproval({
      agentId: 'agent-dev',
      taskTitle: 'Test Task',
      action: 'Need manage permissions',
      risk: 'high',
      estimatedCost: 0,
      requiredPermission: 'system:manage_permissions',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('cannot be requested');
  });

  it('rejects system:manage_roles request', async () => {
    const result = await requestApproval({
      agentId: 'agent-dev',
      taskTitle: 'Test Task',
      action: 'Need manage roles',
      risk: 'high',
      estimatedCost: 0,
      requiredPermission: 'system:manage_roles',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('cannot be requested');
  });

  it('returns already_granted when agent already has permission', async () => {
    const dev = mockStore.agents.find((a: any) => a.id === 'agent-dev');
    dev.permissions = [{ type: 'file:write', scope: ['API/**'] }];

    const result = await requestApproval({
      agentId: 'agent-dev',
      taskTitle: 'Test Task',
      action: 'Need file:write for API',
      risk: 'low',
      estimatedCost: 0,
      requiredPermission: 'file:write',
      permissionScope: ['API/**'],
    });

    expect(result.success).toBe(true);
    expect(result.approvalId).toBe('already_granted');
  });

  it('returns already_granted when agent has broader all scope', async () => {
    const dev = mockStore.agents.find((a: any) => a.id === 'agent-dev');
    dev.permissions = [{ type: 'file:write', scope: 'all' }];

    const result = await requestApproval({
      agentId: 'agent-dev',
      taskTitle: 'Test Task',
      action: 'Need file:write for API',
      risk: 'low',
      estimatedCost: 0,
      requiredPermission: 'file:write',
      permissionScope: ['API/**'],
    });

    expect(result.success).toBe(true);
    expect(result.approvalId).toBe('already_granted');
  });

  it('creates human-level approval when no CEO Bot with Telegram', async () => {
    const result = await requestApproval({
      agentId: 'agent-dev',
      taskTitle: 'Test Task',
      action: 'Need file:write for API',
      risk: 'low',
      estimatedCost: 0,
      requiredPermission: 'file:write',
      permissionScope: ['API/**'],
    });

    expect(result.success).toBe(true);
    expect(result.approvalId).toBeDefined();
    expect(result.approvalId).not.toBe('already_granted');

    const approval = mockStore.approvals.find((a: any) => a.id === result.approvalId);
    expect(approval).toBeDefined();
    expect(approval.requiredPermission).toBe('file:write');
    expect(approval.permissionScope).toEqual(['API/**']);
    expect(approval.approverAgentId).toBeUndefined();

    const task = mockStore.tasks.find((t: any) => t.id === 'task-1');
    expect(task.status).toBe('Needs Approval');
  });

  it('routes to CEO Bot when available', async () => {
    mockStore.agents.push({
      id: 'agent-ceo',
      name: 'CEO Bot',
      role: 'Manager',
      status: 'Idle',
      workspaceId: 'ws-1',
      telegramConfig: { botToken: '123:abc', lastChatId: 'chat-1', status: 'running' },
    });

    const result = await requestApproval({
      agentId: 'agent-dev',
      taskTitle: 'Test Task',
      action: 'Need file:write for API',
      risk: 'low',
      estimatedCost: 0,
      requiredPermission: 'file:write',
      permissionScope: ['API/**'],
    });

    expect(result.success).toBe(true);
    const approval = mockStore.approvals.find((a: any) => a.id === result.approvalId);
    expect(approval).toBeDefined();
    expect(approval.approverAgentId).toBe('agent-ceo');

    const sub = mockStore.subscriptions.find((s: any) => s.agentId === 'agent-ceo');
    expect(sub).toBeDefined();
    expect(sub.eventType).toBe('approval.requested');
  });
});
