import { mutateStore, getStore, agentsAreConnected } from './store';
import { Agent, AgentMessage } from '../types';
import { createChatSession } from './llm';
import type { ChatMessage } from './llm/types';
import { loadMemory, createMemory, appendMessage, buildSystemPrompt } from './agent-memory';
import { TELEGRAM_FORMATTING_RULES, markdownToTelegramHtml } from './lib/telegram-formatter';
import { executeTool } from './tools/index';
import { logAction } from './tools/agent';

const TELEGRAM_API = 'https://api.telegram.org/bot';

interface BotState {
  token: string;
  offset: number;
  isActive: boolean;
  abortController: AbortController;
}

const runningBots: Map<string, BotState> = new Map();

type ProcessPendingMessageDeps = {
  getState: typeof getStore;
  setState: typeof mutateStore;
  createSession: typeof createChatSession;
  loadAgentMemory: typeof loadMemory;
  appendAgentMessage: typeof appendMessage;
  runTool: typeof executeTool;
  logTask: typeof logTaskWorkflow;
  logEvent: typeof logAction;
};

export function createProcessPendingMessageHandler(deps: ProcessPendingMessageDeps) {
  return async function processPendingMessage(agent: Agent): Promise<void> {
    const store = deps.getState();
    const freshAgent = store.agents.find(a => a.id === agent.id);
    if (!freshAgent) return;

    const pending = store.messages.find(m =>
      m.toAgentId === agent.id && m.status === 'pending'
    );
    if (!pending) return;

    deps.setState(s => {
      const a = s.agents.find(x => x.id === agent.id);
      if (a) {
        if ((a.activeSessions || 0) > 5) a.activeSessions = 0;
        a.activeSessions = (a.activeSessions || 0) + 1;
      }
      const m = s.messages.find(x => x.id === pending.id);
      if (m) m.status = 'delivered';
    });

    const sender = store.agents.find(a => a.id === pending.fromAgentId);
    const senderName = sender?.name || 'Unknown';
    const senderRole = sender?.role || 'Agent';

    deps.logTask(agent.id, 'Queued Request Started', `Processing queued request from ${senderName} (${senderRole}). Message ${pending.id}.`, 'info');

    const targetSystemPrompt = buildSystemPrompt(freshAgent, 'telegram-queued') +
      `\n\nYou are responding to a queued request from ${senderName} (${senderRole}), a connected agent. Use reply_to_message("${pending.id}", content) to send your reply.`;

    const TIMEOUT_MS = 120000;
    const startTime = Date.now();
    const isRateLimit = (msg: string) => msg.includes('429') || /rate.limit|too many requests/i.test(msg);

    const runSession = async (): Promise<void> => {
      const memory = deps.loadAgentMemory(freshAgent.id);
      const recentMsgs: ChatMessage[] = memory?.recentMessages
        .slice(-6)
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({ role: m.role, content: m.content })) ?? [];

      const chatSession = deps.createSession(freshAgent, targetSystemPrompt, { initialMessages: recentMsgs });
      const userMessage = `Request from ${senderName} (${senderRole}):\n\n${pending.content}\n\nDo the work, then call reply_to_message("${pending.id}", "your response") to reply.`;
      deps.logTask(agent.id, 'LLM Session Started', `Sending queued request ${pending.id} to model.`, 'info');
      let response = await chatSession.sendMessage(userMessage);
      let replyText = response.text;

      while (response.toolCalls && response.toolCalls.length > 0) {
        deps.logTask(agent.id, 'Tool Calls Planned', `Model returned ${response.toolCalls.length} tool call(s) for message ${pending.id}: ${response.toolCalls.map(c => c.function.name).join(', ')}.`, 'info');
        if (Date.now() - startTime > TIMEOUT_MS) {
          deps.logTask(agent.id, 'Queued Request Timeout', `Timeout while processing message ${pending.id}.`, 'warning');
          deps.setState(s => {
            const m = s.messages.find(x => x.id === pending.id);
            if (m) { m.status = 'replied'; m.reply = 'Timeout — agent did not respond in 2 minutes.'; m.repliedAt = new Date().toISOString(); }
          });
          break;
        }

        const results = [];
        for (const call of response.toolCalls) {
          const toolArgs = JSON.parse(call.function.arguments);
          deps.logTask(agent.id, 'Executing Tool', `Calling ${call.function.name} with args ${JSON.stringify(toolArgs).slice(0, 500)}.`, 'info');
          const result = await deps.runTool(call.function.name, toolArgs, agent.id, undefined);
          deps.logTask(agent.id, 'Tool Result', `${call.function.name} returned ${JSON.stringify(result).slice(0, 500)}.`, result?.success === false ? 'warning' : 'info');
          results.push(result);
        }
        deps.logTask(agent.id, 'Sending Tool Results', `Returning ${results.length} tool result(s) to model for message ${pending.id}.`, 'info');
        response = await chatSession.sendToolResults(response.toolCalls, results);
        if (response.text) {
          replyText = response.text;
        }
      }

      return replyText;
    };

    const processWithRetry = async (attempt = 1): Promise<void> => {
      const replyText = await runSession();
      const stored = deps.getState().messages.find(m => m.id === pending.id);
      if (!stored?.reply) {
        const finalReply = replyText || 'Done.';
        deps.setState(s => {
          const m = s.messages.find(x => x.id === pending.id);
          if (m) { m.reply = finalReply; m.status = 'replied'; m.repliedAt = new Date().toISOString(); }
        });
        if (pending.botToken && pending.chatId) {
          deps.setState(s => {
            const m = s.messages.find(x => x.id === pending.id);
            if (m) m.replyDelivered = true;
          });
        }
      }

      if (pending.fromAgentId) {
        await deps.appendAgentMessage(pending.fromAgentId, {
          role: 'user',
          content: `[Reply from ${agent.name}]: ${stored?.reply || replyText || ''}`,
          source: 'system'
        });
      }
      await deps.appendAgentMessage(agent.id, {
        role: 'user',
        content: `[Request from ${senderName}]: ${pending.content}`,
        source: 'system'
      });
      await deps.appendAgentMessage(agent.id, {
        role: 'assistant',
        content: `[Replied to ${senderName}]: ${stored?.reply || replyText || ''}`,
        source: 'system'
      });
      deps.logEvent('Queued Request Processed', `Processed queued request from ${senderName}.`, 'info', agent.id, 'telegram', 'message', freshAgent.workspaceId, { senderName, messageId: pending.id });
      deps.logTask(agent.id, 'Queued Request Finished', `Completed queued request from ${senderName} (${senderRole}).`, 'success');
    };

    try {
      await processWithRetry();
    } catch (e: any) {
      deps.logTask(agent.id, 'Queued Request Failed', `Error while processing message ${pending.id}: ${e.message}`, 'error');
      deps.setState(s => {
        const m = s.messages.find(x => x.id === pending.id);
        if (m) { m.status = 'replied'; m.reply = `Error: ${e.message}`; m.repliedAt = new Date().toISOString(); }
      });
      console.error(`[processPendingMessage] Failed for agent ${agent.name}:`, e.message);
    } finally {
      deps.setState(s => {
        const a = s.agents.find(x => x.id === agent.id);
        if (a) a.activeSessions = Math.max(0, (a.activeSessions || 0) - 1);
      });
      chainProcessNext(agent);
    }
  };
}

export function processPendingMessagesAtStartup(): void {
  const store = getStore();

  // Reset ephemeral session counters — they persist in DB but are meaningless after restart
  mutateStore(s => {
    for (const a of s.agents) {
      a.activeSessions = 0;
      if (a.status === 'Working') a.status = 'Idle';
    }
  });

  const processed = new Set<string>();
  for (const msg of store.messages) {
    if (msg.status === 'pending' && !processed.has(msg.toAgentId)) {
      const agent = store.agents.find(a => a.id === msg.toAgentId);
      if (agent && (!agent.activeSessions || agent.activeSessions === 0)) {
        processed.add(msg.toAgentId);
        processPendingMessage(agent);
      }
    }
  }
}

export const processPendingMessage = createProcessPendingMessageHandler({
  getState: getStore,
  setState: mutateStore,
  createSession: createChatSession,
  loadAgentMemory: loadMemory,
  appendAgentMessage: appendMessage,
  runTool: executeTool,
  logTask: logTaskWorkflow,
  logEvent: logAction,
});

function chainProcessNext(agent: Agent): void {
  const store = getStore();
  const nextPending = store.messages.find(m =>
    m.toAgentId === agent.id && m.status === 'pending'
  );
  if (nextPending) {
    const nextAgent = store.agents.find(a => a.id === agent.id);
    if (nextAgent && (!nextAgent.activeSessions || nextAgent.activeSessions === 0)) {
      processPendingMessage(nextAgent);
    }
  }
}

function logTaskWorkflow(agentId: string, action: string, details: string, type: 'info' | 'success' | 'warning' | 'error' = 'info', metadata?: Record<string, unknown>) {
  const store = getStore();
  const agent = store.agents.find(a => a.id === agentId);
  logAction(action, details, type, agentId, 'telegram', 'message', agent?.workspaceId, metadata);
}

export function startTelegramManager() {
  setInterval(() => {
    const { agents } = getStore();

    agents.forEach(agent => {
      const config = agent.telegramConfig;
      if (config && config.botToken) {
        const bot = runningBots.get(agent.id);
        if (!bot) {
          startBot(agent, config.botToken);
        } else if (bot.token !== config.botToken) {
          stopBot(agent.id);
          startBot(agent, config.botToken);
        }
      } else {
        if (runningBots.has(agent.id)) {
          stopBot(agent.id);
        }
      }
    });

    const currentIds = new Set(agents.map(a => a.id));
    for (const [agentId] of runningBots) {
      if (!currentIds.has(agentId)) {
        stopBot(agentId);
      }
    }
  }, 3000);
}

function stopBot(agentId: string) {
  const bot = runningBots.get(agentId);
  if (bot) {
    bot.isActive = false;
    bot.abortController.abort();
    runningBots.delete(agentId);
    console.log(`[Telegram] Stopped bot for agent ${agentId}`);
  }
}

function startBot(agent: Agent, token: string) {
  const abortController = new AbortController();
  runningBots.set(agent.id, {
    token,
    offset: 0,
    isActive: true,
    abortController
  });

  mutateStore(s => {
    const a = s.agents.find(x => x.id === agent.id);
    if (a) {
      a.telegramConfig = { ...a.telegramConfig!, status: 'running', lastError: undefined };
    }
  });

  console.log(`[Telegram] Started bot for agent ${agent.id}`);
  pollTelegram(agent.id, token);
}

async function pollTelegram(agentId: string, token: string) {
  const bot = runningBots.get(agentId);
  if (!bot || !bot.isActive) {
    console.log(`[Telegram] Polling stopped for agent ${agentId}`);
    return;
  }

  try {
    const url = `${TELEGRAM_API}${token}/getUpdates?offset=${bot.offset}&timeout=5`;
    console.log(`[Telegram] Polling ${url.slice(0, 60)}...`);

    const res = await fetch(url, {
      signal: bot.abortController.signal
    });

    if (!res.ok) {
      throw new Error(`Telegram API Error: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    console.log(`[Telegram] Got ${data.result?.length || 0} updates for agent ${agentId}`);

    if (data.ok && data.result.length > 0) {
      for (const update of data.result) {
        bot.offset = Math.max(bot.offset, update.update_id + 1);
        console.log(`[Telegram] Update ${update.update_id}:`, update.message?.text?.slice(0, 50));
        if (update.message && update.message.text) {
          await handleIncomingMessage(agentId, token, update.message);
        }
      }
    }

    mutateStore(s => {
      const a = s.agents.find(x => x.id === agentId);
      if (a && a.telegramConfig && a.telegramConfig.status !== 'running') {
        a.telegramConfig.status = 'running';
        a.telegramConfig.lastError = undefined;
      }
    });

  } catch (err: any) {
    if (err.name !== 'AbortError') {
      console.error(`[Telegram] Polling Error for agent ${agentId}:`, err.message);
      mutateStore(s => {
        const a = s.agents.find(x => x.id === agentId);
        if (a && a.telegramConfig) {
          a.telegramConfig.status = 'error';
          a.telegramConfig.lastError = err.message;
        }
      });
      await new Promise(resolve => setTimeout(resolve, 5000));
    } else {
      console.log(`[Telegram] Polling aborted for agent ${agentId}`);
    }
  }

  if (bot?.isActive) {
    setTimeout(() => pollTelegram(agentId, token), 1000);
  }
}

type IncomingMessageDeps = {
  getState: typeof getStore;
  setState: typeof mutateStore;
  createSession: typeof createChatSession;
  loadAgentMemory: typeof loadMemory;
  createAgentMemory: typeof createMemory;
  appendAgentMessage: typeof appendMessage;
  runTool: typeof executeTool;
  buildPrompt: typeof buildSystemPrompt;
  logEvent: typeof logAction;
  markdownToTelegram: typeof markdownToTelegramHtml;
  fetchImpl: typeof fetch;
};

export function createHandleIncomingMessageHandler(deps: IncomingMessageDeps) {
  return async function handleIncomingMessage(agentId: string, token: string, message: any) {
    const chatId = message.chat.id;
    const text = message.text;

    const agentInfo = deps.getState().agents.find(a => a.id === agentId);
    if (!agentInfo) return;

    const senderId = message.from?.id;
    const allowedIds = agentInfo.telegramConfig?.allowedChatIds;

    if (!allowedIds || allowedIds.length === 0) return;
    if (!senderId || !allowedIds.includes(senderId)) return;

    deps.setState(s => {
      s.logs.unshift({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        agentId,
        action: 'Telegram Message Received',
        details: `${agentInfo.name} received a message: "${text.slice(0, 200)}"`,
        type: 'info',
        source: 'telegram',
        category: 'telegram',
        workspaceId: agentInfo.workspaceId,
        metadata: { chatId, messageText: text, agentName: agentInfo.name, botName: agentInfo.name, direction: 'in' },
      });
      if (s.logs.length > 100) s.logs = s.logs.slice(0, 100);
    });

    if (agentInfo.telegramConfig && agentInfo.telegramConfig.lastChatId !== chatId) {
      deps.setState(s => {
        const a = s.agents.find(x => x.id === agentId);
        if (a && a.telegramConfig) {
          a.telegramConfig.lastChatId = chatId;
        }
      });
    }

    try {
      await deps.fetchImpl(`${TELEGRAM_API}${token}/sendChatAction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, action: 'typing' })
      });

      const store = deps.getState();

      const workspace = agentInfo.workspaceId
        ? store.workspaces.find(w => w.id === agentInfo.workspaceId)
        : undefined;

      let memory = deps.loadAgentMemory(agentId);
      if (!memory) {
        memory = deps.createAgentMemory(agentInfo, workspace);
      }

      const recentMsgs: ChatMessage[] = memory.recentMessages
        .slice(-6)
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({ role: m.role, content: m.content }));

      const systemInstruction = deps.buildPrompt(agentInfo, 'telegram') + '\n\n' + TELEGRAM_FORMATTING_RULES;

      let enhancedText = text;
      const repliedTo = message.reply_to_message?.text;
      if (repliedTo) {
        enhancedText = `[Context: the user is replying to:\n"${repliedTo}"]\n\n${text}`;
      }

      const chatSession = deps.createSession(agentInfo, systemInstruction, { initialMessages: recentMsgs });
      let response = await chatSession.sendMessage(enhancedText);
      let replyText = response.text;

      const calledTools: string[] = [];
      const toolResults: Array<{ name: string; result: any }> = [];
      while (response.toolCalls && response.toolCalls.length > 0) {
        const results = [];
        for (const call of response.toolCalls) {
          calledTools.push(call.function.name);
          const args = JSON.parse(call.function.arguments);
          const result = await deps.runTool(call.function.name, args, agentId, token);
          toolResults.push({ name: call.function.name, result });
          results.push(result);
        }
        response = await chatSession.sendToolResults(response.toolCalls, results);
        if (response.text) {
          replyText = response.text;
        }
      }

      let finalReply = replyText.trim();
      const askAgentResult = [...toolResults].reverse().find(item => item.name === 'ask_agent' && item.result?.success && typeof item.result.reply === 'string');
      if (askAgentResult?.result?.reply) {
        finalReply = askAgentResult.result.reply.trim();
      }
      if (!finalReply) {
        if (calledTools.includes('send_message')) {
          finalReply = 'Message sent.';
        } else if (calledTools.length > 0) {
          finalReply = 'Done.';
        } else {
          finalReply = 'Task executed successfully.';
        }
      }

      await deps.appendAgentMessage(agentId, { role: 'user', content: enhancedText, source: 'telegram' });
      await deps.appendAgentMessage(agentId, { role: 'assistant', content: finalReply, source: 'telegram' });

      const telegramText = deps.markdownToTelegram(finalReply);

      const res = await deps.fetchImpl(`${TELEGRAM_API}${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: telegramText, parse_mode: 'HTML' })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(`Telegram Send Error: ${errData.description}`);
      }

    } catch (err: any) {
      console.error('[Telegram] Error processing message:', err.message);
      await deps.fetchImpl(`${TELEGRAM_API}${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: `Sorry, I encountered an internal cognitive error: ${err.message}` })
      });
    }
  };
}

export const handleIncomingMessage = createHandleIncomingMessageHandler({
  getState: getStore,
  setState: mutateStore,
  createSession: createChatSession,
  loadAgentMemory: loadMemory,
  createAgentMemory: createMemory,
  appendAgentMessage: appendMessage,
  runTool: executeTool,
  buildPrompt: buildSystemPrompt,
  logEvent: logAction,
  markdownToTelegram: markdownToTelegramHtml,
  fetchImpl: fetch,
});

/**
 * Orchestrator tool: ask_agent — creates an LLM session for the target agent
 * to process a request synchronously and return a reply.
 */
type AskAgentDeps = {
  getState: typeof getStore;
  setState: typeof mutateStore;
  createSession: typeof createChatSession;
  loadAgentMemory: typeof loadMemory;
  appendAgentMessage: typeof appendMessage;
  runTool: typeof executeTool;
  logTask: typeof logTaskWorkflow;
  logEvent: typeof logAction;
  isConnected: typeof agentsAreConnected;
};

export function createAskAgentHandler(deps: AskAgentDeps) {
  return async function handleAskAgent(args: any, executingAgentId: string, token?: string): Promise<any> {
    const state = deps.getState();
    const executingAgent = state.agents.find(a => a.id === executingAgentId);
    const targetAgent = state.agents.find(a => a.name.toLowerCase().includes(args.agentName.toLowerCase()));
    if (!targetAgent) return { success: false, error: `Agent "${args.agentName}" not found.` };
    if (targetAgent.id === executingAgentId) return { success: false, error: 'You cannot ask yourself.' };
    if (!deps.isConnected(executingAgentId, targetAgent.id, state.agents)) {
      return { success: false, error: `You are not connected to "${targetAgent.name}".` };
    }

    const senderName = executingAgent?.name || 'Unknown';
    const senderRole = executingAgent?.role || 'Agent';
    const chatId = executingAgent?.telegramConfig?.lastChatId;
    const botToken = executingAgent?.telegramConfig?.botToken;
    const now = new Date().toISOString();

    const messageId = crypto.randomUUID();
    const message: AgentMessage = {
      id: messageId,
      fromAgentId: executingAgentId,
      toAgentId: targetAgent.id,
      content: args.content,
      status: 'pending',
      createdAt: now,
      chatId,
      botToken,
    };

    deps.setState(s => {
      s.messages.push(message);
    });

    deps.logTask(executingAgentId, 'Ask Agent Started', `Request ${messageId} sent to ${targetAgent.name}.`, 'info');

    const wasBusy = (targetAgent.activeSessions || 0) > 0;

    deps.setState(s => {
      const a = s.agents.find(x => x.id === targetAgent.id);
      if (a) {
        if ((a.activeSessions || 0) > 5) a.activeSessions = 0;
        a.activeSessions = (a.activeSessions || 0) + 1;
      }
    });

    let busyContext = '';
    let busyUserNote = `Do the work, then call reply_to_message("${messageId}", "your response") to reply.`;
    if (wasBusy) {
      const currentTask = state.tasks.find(t => t.id === targetAgent.currentTaskId && t.status === 'In Progress');
      if (currentTask) {
        busyContext = `\n\nCRITICAL CONTEXT: You are currently working on task "${currentTask.title}" in another session. This is a quick interrupt from another agent.`;
        busyUserNote = `Note: You are in the middle of task "${currentTask.title}". If this request requires significant work, reply briefly with a short acknowledgment and say you will handle it after finishing your current task. If it's a quick question, answer immediately. Either way, call reply_to_message("${messageId}", "your response").`;
      } else {
        busyContext = `\n\nCRITICAL CONTEXT: You are currently busy with another task. This is a quick interrupt from another agent.`;
        busyUserNote = `Note: You are in the middle of another task. If this request requires significant work, reply briefly with a short acknowledgment and say you will handle it after. If it's a quick question, answer immediately. Either way, call reply_to_message("${messageId}", "your response").`;
      }
    }

    const targetSystemPrompt = buildSystemPrompt(targetAgent, 'telegram-ask') +
      `\n\nYou are responding to a request from ${senderName} (${senderRole}), a connected agent. Use reply_to_message("${messageId}", content) to send your reply.` + busyContext;

    const TIMEOUT_MS = 120000;
    const startTime = Date.now();
    const isRateLimit = (msg: string) => msg.includes('429') || /rate.limit|too many requests/i.test(msg);

    const askRunSession = async (): Promise<string> => {
      const targetMemory = deps.loadAgentMemory(targetAgent.id);
      const recentMsgs: ChatMessage[] = targetMemory?.recentMessages
        .slice(-6)
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({ role: m.role, content: m.content })) ?? [];

      const chatSession = deps.createSession(targetAgent, targetSystemPrompt, { initialMessages: recentMsgs });
      const userMessage = `Request from ${senderName} (${senderRole}):\n\n${args.content}\n\n${busyUserNote}`;
      deps.logTask(targetAgent.id, 'LLM Session Started', `Processing ask_agent request ${messageId} from ${senderName}.`, 'info');
      let response = await chatSession.sendMessage(userMessage);
      let replyText = response.text;

      while (response.toolCalls && response.toolCalls.length > 0) {
        deps.logTask(targetAgent.id, 'Tool Calls Planned', `Model returned ${response.toolCalls.length} tool call(s) for ask_agent request ${messageId}: ${response.toolCalls.map(c => c.function.name).join(', ')}.`, 'info');
        if (Date.now() - startTime > TIMEOUT_MS) {
          deps.logTask(targetAgent.id, 'Ask Agent Timeout', `Timeout while processing request ${messageId}.`, 'warning');
          deps.setState(s => {
            const m = s.messages.find(x => x.id === messageId);
            if (m) { m.status = 'replied'; m.reply = 'Timeout — agent did not respond in 2 minutes.'; m.repliedAt = now; }
          });
          return '';
        }

        const results = [];
        for (const call of response.toolCalls) {
          const toolArgs = JSON.parse(call.function.arguments);
          deps.logTask(targetAgent.id, 'Executing Tool', `Calling ${call.function.name} with args ${JSON.stringify(toolArgs).slice(0, 500)} for request ${messageId}.`, 'info');
          const result = await deps.runTool(call.function.name, toolArgs, targetAgent.id, undefined);
          deps.logTask(targetAgent.id, 'Tool Result', `${call.function.name} returned ${JSON.stringify(result).slice(0, 500)} for request ${messageId}.`, result?.success === false ? 'warning' : 'info');
          results.push(result);
        }
        deps.logTask(targetAgent.id, 'Sending Tool Results', `Returning ${results.length} tool result(s) to model for ask_agent request ${messageId}.`, 'info');
        response = await chatSession.sendToolResults(response.toolCalls, results);
        if (response.text) {
          replyText = response.text;
        }
      }

      return replyText;
    };

    const askProcessWithRetry = async (attempt = 1): Promise<string> => {
      try {
        return await askRunSession();
      } catch (e: any) {
        if (isRateLimit(String(e.message ?? '')) && attempt < 3) {
          deps.logTask(targetAgent.id, 'Ask Agent Retry', `Retry ${attempt}/3 after rate limit error.`, 'warning');
          await new Promise(resolve => setTimeout(resolve, attempt * 5000));
          return askProcessWithRetry(attempt + 1);
        }
        throw e;
      }
    };

    try {
      const replyText = await askProcessWithRetry();

      const stored = deps.getState().messages.find(m => m.id === messageId);
      if (!stored?.reply) {
        const finalReply = replyText || 'Done.';
        deps.setState(s => {
          const m = s.messages.find(x => x.id === messageId);
          if (m) { m.reply = finalReply; m.status = 'replied'; m.repliedAt = now; }
        });
        if (botToken && chatId) {
          deps.setState(s2 => {
            const m2 = s2.messages.find(x => x.id === messageId);
            if (m2) m2.replyDelivered = true;
          });
        }
      }

      await deps.appendAgentMessage(executingAgentId, {
        role: 'user',
        content: `[Asked ${targetAgent.name}]: ${args.content}`,
        source: 'telegram'
      });
      await deps.appendAgentMessage(executingAgentId, {
        role: 'assistant',
        content: `[Reply from ${targetAgent.name}]: ${stored?.reply || replyText || ''}`,
        source: 'telegram'
      });
      await deps.appendAgentMessage(targetAgent.id, {
        role: 'user',
        content: `[Request from ${senderName}]: ${args.content}`,
        source: 'telegram'
      });
      await deps.appendAgentMessage(targetAgent.id, {
        role: 'assistant',
        content: `[Replied to ${senderName}]: ${stored?.reply || replyText || ''}`,
        source: 'telegram'
      });

      deps.logEvent('Agent Asked', `Asked ${targetAgent.name} and got reply.`, 'info', executingAgentId, 'telegram', 'message', executingAgent?.workspaceId, { senderName: executingAgent?.name, targetAgentName: targetAgent.name, messageId });
      deps.logTask(targetAgent.id, 'Ask Agent Finished', `Completed request ${messageId} from ${senderName}.`, 'success');
      return { success: true, from: targetAgent.name, role: targetAgent.role, reply: stored?.reply || replyText };
    } catch (e: any) {
      deps.logTask(targetAgent.id, 'Ask Agent Failed', `Error while processing request ${messageId}: ${e.message}`, 'error');
      deps.setState(s => {
        const m = s.messages.find(x => x.id === messageId);
        if (m) { m.status = 'replied'; m.reply = `Error: ${e.message}`; m.repliedAt = now; }
      });
      return { success: false, error: `Failed to get response from ${targetAgent.name}: ${e.message}` };
    } finally {
      deps.setState(s => {
        const a = s.agents.find(x => x.id === targetAgent.id);
        if (a) a.activeSessions = Math.max(0, (a.activeSessions || 0) - 1);
      });
      chainProcessNext(targetAgent);
    }
  };
}

export const handleAskAgent = createAskAgentHandler({
  getState: getStore,
  setState: mutateStore,
  createSession: createChatSession,
  loadAgentMemory: loadMemory,
  appendAgentMessage: appendMessage,
  runTool: executeTool,
  logTask: logTaskWorkflow,
  logEvent: logAction,
  isConnected: agentsAreConnected,
});
