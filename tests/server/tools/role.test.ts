import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockStore: any = {
  agents: [],
  workspaces: [],
  roles: [],
  logs: [],
};
vi.mock('../../../src/server/store', () => ({
  getStore: () => mockStore,
  mutateStore: (fn: (s: any) => void) => fn(mockStore),
  hasPermission: vi.fn((agentId: string, perm: string) => {
    const agent = mockStore.agents.find((a: any) => a.id === agentId);
    if (!agent) return false;
    const allPerms = [...(agent.permissions || [])];
    return allPerms.some((p: any) => p.type === perm);
  }),
}));

import { handleGrantPermissionToRole } from '../../../src/server/tools/role';

describe('handleGrantPermissionToRole', () => {
  beforeEach(() => {
    mockStore.agents = [{
      id: 'agent-no-perms',
      name: 'No Perms Agent',
      workspaceId: 'ws-test',
      permissions: [],
    }];
    mockStore.workspaces = [{ id: 'ws-test', name: 'Test', slug: 'test' }];
    mockStore.roles = [{
      id: 'role-dev',
      name: 'developer',
      workspaceId: 'ws-test',
      permissions: [{ type: 'file:write', scope: 'all' }],
    }];
  });

  it('returns error with escalation hint when agent lacks system:manage_roles', async () => {
    const result = await handleGrantPermissionToRole({
      roleName: 'developer',
      permissionType: 'folder:write',
    }, 'agent-no-perms');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Call request_approval with requiredPermission="system:manage_roles"');
  });

  it('grants permission when agent has system:manage_roles', async () => {
    mockStore.agents[0].permissions = [{ type: 'system:manage_roles', scope: 'all' }];

    const result = await handleGrantPermissionToRole({
      roleName: 'developer',
      permissionType: 'folder:write',
    }, 'agent-no-perms');

    expect(result.success).toBe(true);
    expect(result.message).toContain('folder:write');

    const role = mockStore.roles.find((r: any) => r.id === 'role-dev');
    expect(role.permissions.some((p: any) => p.type === 'folder:write')).toBe(true);
  });
});
