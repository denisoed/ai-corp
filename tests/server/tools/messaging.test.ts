import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAppendMessage = vi.fn();
const mockLogAction = vi.fn();
const mockProcessPendingMessage = vi.fn().mockResolvedValue(undefined);
const mockGetStore = vi.fn();
const mockMutateStore = vi.fn();

vi.mock('../../../src/server/agent-memory', () => ({
  appendMessage: (...args: unknown[]) => mockAppendMessage(...args),
}));

vi.mock('../../../src/server/store', () => ({
  getStore: () => mockGetStore(),
  mutateStore: (updater: unknown) => mockMutateStore(updater),
  agentsAreConnected: () => true,
  hasPermission: () => true,
}));

vi.mock('../../../src/server/tools/agent', () => ({
  findAgent: (name: string) => mockGetStore().agents.find((a: { name: string }) => a.name === name),
  logAction: (...args: unknown[]) => mockLogAction(...args),
}));

vi.mock('../../../src/server/telegram', () => ({
  processPendingMessage: (...args: unknown[]) => mockProcessPendingMessage(...args),
}));

import { handleReplyToMessage, handleSendMessage } from '../../../src/server/tools/messaging';

describe('messaging tools', () => {
  beforeEach(() => {
    mockAppendMessage.mockClear();
    mockLogAction.mockClear();
    mockProcessPendingMessage.mockClear();
    mockGetStore.mockReset();
    mockMutateStore.mockClear();
  });

  it('send_message stores the outgoing message in the recipient inbox', async () => {
    mockGetStore.mockReturnValue({
      agents: [
        { id: 'agent-1', name: 'Alice', telegramConfig: { lastChatId: 'chat-1', botToken: 'token-1' } },
        { id: 'agent-2', name: 'PM', telegramConfig: {} },
      ],
      messages: [],
    });

    const result = await handleSendMessage({ agentName: 'PM', content: 'How are tasks?' }, 'agent-1');

    expect(result.success).toBe(true);
    expect(mockAppendMessage).toHaveBeenCalledWith('agent-1', expect.objectContaining({
      role: 'system',
      content: '[Sent to PM]: How are tasks?',
      source: 'telegram',
    }));
    await vi.waitFor(() => {
      expect(mockProcessPendingMessage).toHaveBeenCalledOnce();
    });
  });

  it('reply_to_message stores the reply for both sender and replier', async () => {
    mockGetStore.mockReturnValue({
      agents: [
        { id: 'agent-1', name: 'Alice', telegramConfig: { lastChatId: 'chat-1', botToken: 'token-1' } },
        { id: 'agent-2', name: 'PM', telegramConfig: {} },
      ],
      messages: [
        { id: 'msg-1', fromAgentId: 'agent-1', toAgentId: 'agent-2', status: 'delivered', createdAt: new Date().toISOString() },
      ],
    });

    const result = await handleReplyToMessage({ messageId: 'msg-1', content: 'All good.' }, 'agent-2');

    expect(result.success).toBe(true);
    expect(mockAppendMessage).toHaveBeenCalledWith('agent-2', expect.objectContaining({
      role: 'system',
      content: '[Replied to Alice]: All good.',
      source: 'telegram',
    }));
    expect(mockAppendMessage).toHaveBeenCalledWith('agent-1', expect.objectContaining({
      role: 'system',
      content: '[Reply from PM]: All good.',
      source: 'telegram',
    }));
  });
});
