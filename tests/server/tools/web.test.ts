import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock store for permission checks
const mockStore: any = {
  agents: [
    {
      id: 'agent-1',
      workspaceId: 'ws-1',
      roleIds: ['role-admin'],
      permissions: [{ type: 'system:http_request', scope: 'all' }],
    },
  ],
  workspaces: [
    {
      id: 'ws-1',
      slug: 'test-workspace',
      agentIds: ['agent-1'],
      settings: {
        allowedHttpDomains: [
          { domain: 'api.example.com' },
          { domain: 'github.com' },
        ],
      },
    },
  ],
  roles: [
    {
      id: 'role-admin',
      workspaceId: 'ws-1',
      name: 'admin',
      permissions: [
        { type: 'system:http_request', scope: 'all' },
      ],
    },
  ],
  logs: [] as any[],
  messages: [],
};

vi.mock('../../../src/server/store', () => ({
  getStore: () => mockStore,
  mutateStore: vi.fn((updater: (draft: any) => void) => updater(mockStore)),
  hasPermission: vi.fn((agentId: string, permissionType: string) => {
    if (permissionType === 'system:http_request') return true;
    if (permissionType === 'system:web_search') return true;
    if (permissionType === 'system:fetch_url') return true;
    return false;
  }),
  getEffectivePermissions: vi.fn(() => [
    { type: 'system:http_request', scope: 'all' },
  ]),
}));

vi.mock('../../../src/server/lib/search', () => ({
  performSearch: vi.fn(async () => []),
}));

import { handleHttpRequest } from '../../../src/server/tools/web';

describe('http_request tool', () => {
  beforeEach(() => {
    mockStore.logs = [];
  });

  it('validates HTTP method', async () => {
    const result = await handleHttpRequest(
      { method: 'INVALID', url: 'https://example.com' },
      'agent-1'
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unsupported HTTP method');
  });

  it('validates URL format', async () => {
    const result = await handleHttpRequest(
      { method: 'GET', url: 'not-a-url' },
      'agent-1'
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid URL');
  });

  it('blocks private hosts', async () => {
    const result = await handleHttpRequest(
      { method: 'GET', url: 'http://localhost:8080/api' },
      'agent-1'
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('private');
  });

  it('blocks internal IPs', async () => {
    const result = await handleHttpRequest(
      { method: 'GET', url: 'http://192.168.1.1/admin' },
      'agent-1'
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('private');
  });

  it('rejects non-HTTP protocols', async () => {
    const result = await handleHttpRequest(
      { method: 'GET', url: 'ftp://files.example.com/data' },
      'agent-1'
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('Only HTTP and HTTPS');
  });

  it('requires URL parameter', async () => {
    const result = await handleHttpRequest(
      { method: 'GET' },
      'agent-1'
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('URL is required');
  });

  it('blocks domains not in workspace whitelist', async () => {
    const result = await handleHttpRequest(
      { method: 'GET', url: 'https://evil.com/steal' },
      'agent-1'
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('not in the workspace');
    expect(result.error).toContain('api.example.com');
    expect(result.error).toContain('github.com');
  });
});
