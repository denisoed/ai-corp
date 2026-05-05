import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockMutateFn = vi.fn<(updater: (draft: any) => void) => void>();

vi.mock('../../../src/server/store', () => ({
  mutateStore: (updater: (draft: any) => void) => mockMutateFn(updater),
  getStore: () => ({}),
}));

import { logAction } from '../../../src/server/tools/agent';

describe('logAction', () => {
  beforeEach(() => {
    mockMutateFn.mockClear();
  });

  it('creates a log entry with required fields', () => {
    logAction('Agent Created', 'Created agent Bob.', 'success', 'agent-1');

    expect(mockMutateFn).toHaveBeenCalledOnce();

    const updater = mockMutateFn.mock.calls[0][0];
    const store = { logs: [] as any[] };
    updater(store);

    expect(store.logs).toHaveLength(1);
    const log = store.logs[0];
    expect(log.action).toBe('Agent Created');
    expect(log.details).toBe('Created agent Bob.');
    expect(log.type).toBe('success');
    expect(log.agentId).toBe('agent-1');
    expect(log.id).toBeDefined();
    expect(log.timestamp).toBeDefined();
  });

  it('creates a log entry with source and category', () => {
    logAction('LLM Call', 'Model: claude-3', 'info', 'agent-1', 'llm', 'llm');

    const updater = mockMutateFn.mock.calls[0][0];
    const store = { logs: [] as any[] };
    updater(store);

    const log = store.logs[0];
    expect(log.source).toBe('llm');
    expect(log.category).toBe('llm');
  });

  it('creates a log entry with workspaceId', () => {
    logAction('Task Created', 'Created task.', 'success', 'agent-1', 'tool', 'task', 'ws-1');

    const updater = mockMutateFn.mock.calls[0][0];
    const store = { logs: [] as any[] };
    updater(store);

    const log = store.logs[0];
    expect(log.workspaceId).toBe('ws-1');
  });

  it('creates a log entry with metadata', () => {
    const meta = {
      model: 'claude-3-opus',
      inputTokens: 1500,
      outputTokens: 350,
      totalTokens: 1850,
      cost: 0.0235,
      functionCalls: ['read_file', 'write_file'],
      promptMessages: [{ role: 'user', content: 'Hello' }],
      responseContent: 'Hi there!',
    };

    logAction('LLM Call', 'Model: claude-3-opus | Tools: read_file, write_file', 'info', 'agent-1', 'llm', 'llm', undefined, meta);

    const updater = mockMutateFn.mock.calls[0][0];
    const store = { logs: [] as any[] };
    updater(store);

    const log = store.logs[0];
    expect(log.metadata).toEqual(meta);
  });

  it('creates a log entry with all fields', () => {
    const meta = { taskId: 'task-1', taskTitle: 'Fix login bug', fromStatus: 'In Progress', toStatus: 'Done' };

    logAction('Task Moved', 'Moved "Fix login bug" to Done.', 'success', 'agent-2', 'tool', 'task', 'ws-3', meta);

    const updater = mockMutateFn.mock.calls[0][0];
    const store = { logs: [] as any[] };
    updater(store);

    const log = store.logs[0];
    expect(log.action).toBe('Task Moved');
    expect(log.type).toBe('success');
    expect(log.agentId).toBe('agent-2');
    expect(log.source).toBe('tool');
    expect(log.category).toBe('task');
    expect(log.workspaceId).toBe('ws-3');
    expect(log.metadata).toEqual(meta);
  });

  it('handles optional fields as undefined', () => {
    logAction('System Initialized', 'Welcome.', 'info', 'system');

    const updater = mockMutateFn.mock.calls[0][0];
    const store = { logs: [] as any[] };
    updater(store);

    const log = store.logs[0];
    expect(log.source).toBeUndefined();
    expect(log.category).toBeUndefined();
    expect(log.workspaceId).toBeUndefined();
    expect(log.metadata).toBeUndefined();
  });

  it('trims logs to maximum 100 entries', () => {
    // Add 105 logs — the updater should always trim to max 100
    for (let i = 0; i < 105; i++) {
      logAction('Test', `Log ${i}`, 'info', 'agent-1');
    }

    // Verify the last updater trims correctly: initial 100 + 1 unshift = 101, then sliced to 100
    const lastUpdater = mockMutateFn.mock.calls[104][0];
    const lastStore = { logs: new Array(100).fill(null).map((_, i) => ({ id: `old-${i}` })) };
    lastUpdater(lastStore);

    expect(lastStore.logs.length).toBe(100);
  });

  it('uses correct source values across all source types', () => {
    const sources = ['system', 'agent', 'cron', 'telegram', 'task-autopilot', 'events', 'tool', 'llm'] as const;

    for (const source of sources) {
      logAction('Test', 'Details', 'info', 'agent-1', source, 'task');
    }

    for (let i = 0; i < sources.length; i++) {
      const updater = mockMutateFn.mock.calls[i][0];
      const store = { logs: [] as any[] };
      updater(store);
      expect(store.logs[0].source).toBe(sources[i]);
    }
  });

  it('uses correct category values', () => {
    const categories = ['llm', 'tool', 'task', 'agent', 'cron', 'telegram', 'file', 'event', 'approval', 'message', 'role', 'web', 'connection', 'system'] as const;

    for (const category of categories) {
      logAction('Test', 'Details', 'info', 'agent-1', 'tool', category);
    }

    for (let i = 0; i < categories.length; i++) {
      const updater = mockMutateFn.mock.calls[i][0];
      const store = { logs: [] as any[] };
      updater(store);
      expect(store.logs[0].category).toBe(categories[i]);
    }
  });
});
