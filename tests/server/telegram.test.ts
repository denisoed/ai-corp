import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetState = vi.fn();
const mockMutateStore = vi.fn();
const mockCreateSession = vi.fn();
const mockLoadMemory = vi.fn(() => null);
const mockCreateMemory = vi.fn(() => ({ recentMessages: [] }));
const mockAppendMessage = vi.fn();
const mockBuildSystemPrompt = vi.fn(() => 'SYSTEM_PROMPT');
const mockExecuteTool = vi.fn();
const mockLogAction = vi.fn();
const mockMarkdownToTelegram = vi.fn((text: string) => `HTML:${text}`);
const mockFetch = vi.fn();

vi.mock('../../src/server/store', () => ({
  getStore: () => mockGetState(),
  mutateStore: (updater: unknown) => mockMutateStore(updater),
  agentsAreConnected: () => true,
}));

vi.mock('../../src/server/llm', () => ({
  createChatSession: (...args: unknown[]) => mockCreateSession(...args),
}));

vi.mock('../../src/server/agent-memory', () => ({
  loadMemory: (...args: unknown[]) => mockLoadMemory(...args),
  createMemory: (...args: unknown[]) => mockCreateMemory(...args),
  appendMessage: (...args: unknown[]) => mockAppendMessage(...args),
  buildSystemPrompt: (...args: unknown[]) => mockBuildSystemPrompt(...args),
}));

vi.mock('../../src/server/tools/index', () => ({
  executeTool: (...args: unknown[]) => mockExecuteTool(...args),
}));

vi.mock('../../src/server/tools/agent', () => ({
  logAction: (...args: unknown[]) => mockLogAction(...args),
}));

vi.mock('../../src/server/lib/telegram-formatter', () => ({
  TELEGRAM_FORMATTING_RULES: '',
  markdownToTelegramHtml: (text: string) => mockMarkdownToTelegram(text),
}));

import { handleAskAgent, processPendingMessage, createHandleIncomingMessageHandler } from '../../src/server/telegram';

describe('telegram orchestrators', () => {
  const state = {
    agents: [] as any[],
    tasks: [] as any[],
    messages: [] as any[],
    logs: [] as any[],
    workspaces: [] as any[],
  };

  let handleIncomingMessage: (agentId: string, token: string, message: any) => Promise<void>;

  beforeEach(() => {
    vi.clearAllMocks();
    state.agents = [
      {
        id: 'agent-1',
        name: 'Alice',
        role: 'Manager',
        activeSessions: 0,
        workspaceId: 'ws-1',
        telegramConfig: { lastChatId: 'chat-1', botToken: 'token-1' },
      },
      {
        id: 'agent-2',
        name: 'PM',
        role: 'Manager',
        activeSessions: 0,
        workspaceId: 'ws-1',
        telegramConfig: {},
      },
    ];
    state.tasks = [];
    state.messages = [];
    state.logs = [];
    state.workspaces = [{
      id: 'ws-1',
      name: 'Workspace',
      slug: 'workspace',
      description: '',
      folderPath: '/',
      agentIds: ['agent-1', 'agent-2'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }];

    mockGetState.mockImplementation(() => state);
    mockMutateStore.mockImplementation((updater: (draft: typeof state) => void) => updater(state));

    mockCreateSession.mockReturnValue({
      sendMessage: vi.fn().mockResolvedValue({ text: 'I am good.', toolCalls: [] }),
      sendToolResults: vi.fn(),
    });

    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({}),
    });

    handleIncomingMessage = createHandleIncomingMessageHandler({
      getState: () => mockGetState(),
      setState: (u: unknown) => mockMutateStore(u),
      createSession: (...args: unknown[]) => mockCreateSession(...args),
      loadAgentMemory: (...args: unknown[]) => mockLoadMemory(...args),
      createAgentMemory: (...args: unknown[]) => mockCreateMemory(...args),
      appendAgentMessage: (...args: unknown[]) => mockAppendMessage(...args),
      runTool: (...args: unknown[]) => mockExecuteTool(...args),
      buildPrompt: (...args: unknown[]) => mockBuildSystemPrompt(...args),
      logEvent: (...args: unknown[]) => mockLogAction(...args),
      markdownToTelegram: (...args: unknown[]) => mockMarkdownToTelegram(...args),
      fetchImpl: mockFetch,
    });
  });

  it('routes ask_agent to the target agent and stores reply metadata on both sides', async () => {
    const result = await handleAskAgent({ agentName: 'PM', content: 'How are tasks?' }, 'agent-1');

    expect(result.success).toBe(true);
    expect(mockCreateSession).toHaveBeenCalledOnce();
    expect(mockAppendMessage).toHaveBeenCalledWith('agent-1', expect.objectContaining({
      role: 'user',
      content: '[Asked PM]: How are tasks?',
      source: 'telegram',
    }));
    expect(mockAppendMessage).toHaveBeenCalledWith('agent-1', expect.objectContaining({
      role: 'assistant',
      content: '[Reply from PM]: I am good.',
      source: 'telegram',
    }));
    expect(mockAppendMessage).toHaveBeenCalledWith('agent-2', expect.objectContaining({
      role: 'user',
      content: '[Request from Alice]: How are tasks?',
      source: 'telegram',
    }));
    expect(mockAppendMessage).toHaveBeenCalledWith('agent-2', expect.objectContaining({
      role: 'assistant',
      content: '[Replied to Alice]: I am good.',
      source: 'telegram',
    }));
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0].reply).toBe('I am good.');
    expect(state.agents[1].activeSessions).toBe(0);
  });

  it('processes queued agent messages with the same reply contract', async () => {
    state.messages = [{
      id: 'msg-1',
      fromAgentId: 'agent-1',
      toAgentId: 'agent-2',
      content: 'How are tasks?',
      status: 'pending',
      createdAt: new Date().toISOString(),
      chatId: 'chat-1',
      botToken: 'token-1',
    }];

    const agent = structuredClone(state.agents[1]);
    mockLoadMemory.mockReturnValue({
      recentMessages: [],
      keyFacts: [],
      activeTasks: [],
      workingState: {},
      summary: '',
      retrievalIndex: { updatedAt: '', terms: {} },
    });

    await processPendingMessage(agent);

    expect(mockCreateSession).toHaveBeenCalledOnce();
    expect(mockAppendMessage).toHaveBeenCalledWith('agent-1', expect.objectContaining({
      role: 'user',
      content: '[Reply from PM]: I am good.',
      source: 'system',
    }));
    expect(mockAppendMessage).toHaveBeenCalledWith('agent-2', expect.objectContaining({
      role: 'user',
      content: '[Request from Alice]: How are tasks?',
      source: 'system',
    }));
    expect(mockAppendMessage).toHaveBeenCalledWith('agent-2', expect.objectContaining({
      role: 'assistant',
      content: '[Replied to Alice]: I am good.',
      source: 'system',
    }));
    expect(state.messages[0].status).toBe('replied');
    expect(state.messages[0].reply).toBe('I am good.');
    expect(state.agents[1].activeSessions).toBe(0);
  });

  it('handles incoming telegram messages and posts a reply to the chat', async () => {
    state.agents[1] = {
      id: 'agent-2',
      name: 'PM',
      role: 'Manager',
      activeSessions: 0,
      workspaceId: 'ws-1',
      telegramConfig: { allowedChatIds: [123], lastChatId: 999, botToken: 'token-2' },
    };

    mockLoadMemory.mockReturnValue({
      recentMessages: [],
      keyFacts: [],
      activeTasks: [],
      workingState: {},
      summary: '',
      retrievalIndex: { updatedAt: '', terms: {} },
    });

    await handleIncomingMessage('agent-2', 'token-2', {
      chat: { id: 123 },
      from: { id: 123 },
      text: 'How are tasks?',
    });

    expect(mockCreateSession).toHaveBeenCalledOnce();
    expect(mockAppendMessage).toHaveBeenCalledWith('agent-2', expect.objectContaining({
      role: 'user',
      content: 'How are tasks?',
      source: 'telegram',
    }));
    expect(mockAppendMessage).toHaveBeenCalledWith('agent-2', expect.objectContaining({
      role: 'assistant',
      content: 'I am good.',
      source: 'telegram',
    }));
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.telegram.org/bottoken-2/sendMessage',
      expect.objectContaining({
        method: 'POST',
      })
    );
  });

  it('uses ask_agent tool reply instead of model narration in telegram output', async () => {
    state.agents[1] = {
      id: 'agent-2',
      name: 'PM',
      role: 'Manager',
      activeSessions: 0,
      workspaceId: 'ws-1',
      telegramConfig: { allowedChatIds: [123], lastChatId: 999, botToken: 'token-2' },
    };

    mockLoadMemory.mockReturnValue({
      recentMessages: [],
      keyFacts: [],
      activeTasks: [],
      workingState: {},
      summary: '',
      retrievalIndex: { updatedAt: '', terms: {} },
    });

    mockCreateSession.mockReturnValue({
      sendMessage: vi.fn().mockResolvedValue({
        text: '[Asked PM via ask_agent]: Привет! Как дела? Есть ли текущие задачи в работе или какие-то проблемы?',
        toolCalls: [{
          id: 'call-1',
          type: 'function',
          function: {
            name: 'ask_agent',
            arguments: JSON.stringify({ agentName: 'PM', content: 'Привет! Как дела? Есть ли текущие задачи в работе или какие-то проблемы?' }),
          },
        }],
      }),
      sendToolResults: vi.fn().mockResolvedValue({ text: '', toolCalls: [] }),
    });
    mockExecuteTool.mockResolvedValue({
      success: true,
      from: 'PM',
      role: 'Manager',
      reply: 'С задачами всё в порядке, сейчас в работе два пункта.',
    });

    await handleIncomingMessage('agent-2', 'token-2', {
      chat: { id: 123 },
      from: { id: 123 },
      text: 'Спроси PM агента, как дела с задачами',
    });

    const sendMessageCalls = mockFetch.mock.calls.filter(call => String(call[0]).includes('/sendMessage'));
    expect(sendMessageCalls.at(-1)?.[1]).toEqual(expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('С задачами всё в порядке, сейчас в работе два пункта.'),
    }));
    expect(sendMessageCalls.at(-1)?.[1]).not.toEqual(expect.objectContaining({
      body: expect.stringContaining('via ask_agent'),
    }));
  });
});
