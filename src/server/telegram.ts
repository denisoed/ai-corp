import { mutateStore, getStore, agentsAreConnected } from './store';
import { Agent, AgentMessage } from '../types';
import { OpenCodeChatSession } from './opencode';
import { loadMemory, createMemory, appendMessage, buildSystemPrompt } from './agent-memory';
import { TELEGRAM_FORMATTING_RULES, markdownToTelegramHtml } from './lib/telegram-formatter';
import { executeTool } from './tools/index';

const TELEGRAM_API = 'https://api.telegram.org/bot';

interface BotState {
  token: string;
  offset: number;
  isActive: boolean;
  abortController: AbortController;
}

const runningBots: Map<string, BotState> = new Map();

export async function processPendingMessage(agent: Agent): Promise<void> {
  const store = getStore();
  const freshAgent = store.agents.find(a => a.id === agent.id);
  if (!freshAgent) return;

  const pending = store.messages.find(m =>
    m.toAgentId === agent.id && m.status === 'pending'
  );
  if (!pending) return;

  mutateStore(s => {
    const a = s.agents.find(x => x.id === agent.id);
    if (a) a.activeSessions = (a.activeSessions || 0) + 1;
    const m = s.messages.find(x => x.id === pending.id);
    if (m) m.status = 'delivered';
  });

  const sender = store.agents.find(a => a.id === pending.fromAgentId);
  const senderName = sender?.name || 'Unknown';
  const senderRole = sender?.role || 'Agent';

  const targetSystemPrompt = buildSystemPrompt(freshAgent) +
    `\n\nYou are responding to a queued request from ${senderName} (${senderRole}), a connected agent. Use reply_to_message("${pending.id}", content) to send your reply. You have full tool access — do whatever work is needed before replying.`;

  const TIMEOUT_MS = 120000;
  const startTime = Date.now();

  try {
    const chatSession = new OpenCodeChatSession(targetSystemPrompt);
    const userMessage = `Request from ${senderName} (${senderRole}):\n\n${pending.content}\n\nDo the work, then call reply_to_message("${pending.id}", "your response") to reply.`;
    let response = await chatSession.sendMessage(userMessage);
    let replyText = response.text;

    while (response.toolCalls && response.toolCalls.length > 0) {
      if (Date.now() - startTime > TIMEOUT_MS) {
        mutateStore(s => {
          const m = s.messages.find(x => x.id === pending.id);
          if (m) { m.status = 'delivered'; m.reply = 'Timeout — agent did not respond in 2 minutes.'; m.repliedAt = new Date().toISOString(); }
        });
        break;
      }

      const results = [];
      for (const call of response.toolCalls) {
        const toolArgs = JSON.parse(call.function.arguments);
        const result = await executeTool(call.function.name, toolArgs, agent.id, undefined);
        results.push(result);
      }
      response = await chatSession.sendToolResults(response.toolCalls, results);
      if (response.text) {
        replyText = response.text;
      }
    }

    const stored = getStore().messages.find(m => m.id === pending.id);
    if (!stored?.reply) {
      const finalReply = replyText || 'Done.';
      mutateStore(s => {
        const m = s.messages.find(x => x.id === pending.id);
        if (m) { m.reply = finalReply; m.status = 'replied'; m.repliedAt = new Date().toISOString(); }
      });
      if (pending.botToken && pending.chatId) {
        mutateStore(s => {
          const m = s.messages.find(x => x.id === pending.id);
          if (m) m.replyDelivered = true;
        });
      }
    }

    if (pending.fromAgentId) {
      await appendMessage(pending.fromAgentId, {
        role: 'user',
        content: `[Reply from ${agent.name}]: ${stored?.reply || replyText || ''}`,
        source: 'system'
      });
    }
    await appendMessage(agent.id, {
      role: 'assistant',
      content: `[Replied to ${senderName}]: ${stored?.reply || replyText || ''}`,
      source: 'system'
    });

    logAction('Queued Request Processed', `Processed queued request from ${senderName}.`, 'info', agent.id);
  } catch (e: any) {
    mutateStore(s => {
      const m = s.messages.find(x => x.id === pending.id);
      if (m) { m.status = 'delivered'; m.reply = `Error: ${e.message}`; m.repliedAt = new Date().toISOString(); }
    });
    console.error(`[processPendingMessage] Failed for agent ${agent.name}:`, e.message);
  } finally {
    mutateStore(s => {
      const a = s.agents.find(x => x.id === agent.id);
      if (a) a.activeSessions = Math.max(0, (a.activeSessions || 0) - 1);
    });
    chainProcessNext(agent);
  }
}

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

function logAction(action: string, details: string, type: 'info' | 'success' | 'warning' | 'error', agentId: string) {
  mutateStore(s => {
    s.logs.unshift({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      agentId,
      action,
      details,
      type
    });
    if (s.logs.length > 100) s.logs = s.logs.slice(0, 100);
  });
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

async function handleIncomingMessage(agentId: string, token: string, message: any) {
  const chatId = message.chat.id;
  const text = message.text;

  const agentInfo = getStore().agents.find(a => a.id === agentId);
  if (!agentInfo) return;

  const senderId = message.from?.id;
  const allowedIds = agentInfo.telegramConfig?.allowedChatIds;

  if (!allowedIds || allowedIds.length === 0) return;
  if (!senderId || !allowedIds.includes(senderId)) return;

  mutateStore(s => {
    s.logs.unshift({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      agentId: 'system',
      action: 'Telegram Message Received',
      details: `${agentInfo.name} received a message: "${text}"`,
      type: 'info'
    });
    if (s.logs.length > 100) s.logs = s.logs.slice(0, 100);
  });

  if (agentInfo.telegramConfig && agentInfo.telegramConfig.lastChatId !== chatId) {
    mutateStore(s => {
      const a = s.agents.find(x => x.id === agentId);
      if (a && a.telegramConfig) {
        a.telegramConfig.lastChatId = chatId;
      }
    });
  }

  try {
    await fetch(`${TELEGRAM_API}${token}/sendChatAction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, action: 'typing' })
    });

    const store = getStore();

    const workspace = agentInfo.workspaceId
      ? store.workspaces.find(w => w.id === agentInfo.workspaceId)
      : undefined;

    let memory = loadMemory(agentId);
    if (!memory) {
      memory = createMemory(agentInfo, workspace);
    }

    const systemInstruction = buildSystemPrompt(agentInfo) + '\n\n' + TELEGRAM_FORMATTING_RULES;

    const chatSession = new OpenCodeChatSession(systemInstruction);
    let response = await chatSession.sendMessage(text);
    let replyText = response.text;

    while (response.toolCalls && response.toolCalls.length > 0) {
      const results = [];
      for (const call of response.toolCalls) {
        const args = JSON.parse(call.function.arguments);
        const result = await executeTool(call.function.name, args, agentId, token);
        results.push(result);
      }
      response = await chatSession.sendToolResults(response.toolCalls, results);
      if (response.text) {
        replyText = response.text;
      }
    }

    let finalReply = replyText.trim();
    if (!finalReply) {
      finalReply = 'Task executed successfully.';
    }

    await appendMessage(agentId, { role: 'user', content: text, source: 'telegram' });
    await appendMessage(agentId, { role: 'assistant', content: finalReply, source: 'telegram' });

    const telegramText = markdownToTelegramHtml(finalReply);

    const res = await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
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
    await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: `Sorry, I encountered an internal cognitive error: ${err.message}` })
    });
  }
}

/**
 * Orchestrator tool: ask_agent — creates an OpenCode session for the target agent
 * to process a request synchronously and return a reply.
 */
export async function handleAskAgent(args: any, executingAgentId: string, token?: string): Promise<any> {
  const state = getStore();
  const executingAgent = state.agents.find(a => a.id === executingAgentId);
  const targetAgent = state.agents.find(a => a.name.toLowerCase().includes(args.agentName.toLowerCase()));
  if (!targetAgent) return { success: false, error: `Agent "${args.agentName}" not found.` };
  if (targetAgent.id === executingAgentId) return { success: false, error: 'You cannot ask yourself.' };
  if (!agentsAreConnected(executingAgentId, targetAgent.id, state.agents)) {
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

  mutateStore(s => {
    s.messages.push(message);
  });

  const wasBusy = (targetAgent.activeSessions || 0) > 0;

  mutateStore(s => {
    const a = s.agents.find(x => x.id === targetAgent.id);
    if (a) a.activeSessions = (a.activeSessions || 0) + 1;
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

  const targetSystemPrompt = buildSystemPrompt(targetAgent) +
    `\n\nYou are responding to a request from ${senderName} (${senderRole}), a connected agent. Use reply_to_message("${messageId}", content) to send your reply.` + busyContext;

  const TIMEOUT_MS = 120000;
  const startTime = Date.now();

  try {
    const chatSession = new OpenCodeChatSession(targetSystemPrompt);
    const userMessage = `Request from ${senderName} (${senderRole}):\n\n${args.content}\n\n${busyUserNote}`;
    let response = await chatSession.sendMessage(userMessage);
    let replyText = response.text;

    while (response.toolCalls && response.toolCalls.length > 0) {
      if (Date.now() - startTime > TIMEOUT_MS) {
        mutateStore(s => {
          const m = s.messages.find(x => x.id === messageId);
          if (m) { m.status = 'delivered'; m.reply = 'Timeout — agent did not respond in 2 minutes.'; m.repliedAt = now; }
        });
        return { success: false, error: `Timeout waiting for ${targetAgent.name} to respond (2 min limit).` };
      }

      const results = [];
      for (const call of response.toolCalls) {
        const toolArgs = JSON.parse(call.function.arguments);
        const result = await executeTool(call.function.name, toolArgs, targetAgent.id, undefined);
        results.push(result);
      }
      response = await chatSession.sendToolResults(response.toolCalls, results);
      if (response.text) {
        replyText = response.text;
      }
    }

    const stored = getStore().messages.find(m => m.id === messageId);
    if (!stored?.reply) {
      const finalReply = replyText || 'Done.';
      mutateStore(s => {
        const m = s.messages.find(x => x.id === messageId);
        if (m) { m.reply = finalReply; m.status = 'replied'; m.repliedAt = now; }
      });
      if (botToken && chatId) {
        mutateStore(s2 => {
          const m2 = s2.messages.find(x => x.id === messageId);
          if (m2) m2.replyDelivered = true;
        });
      }
    }

    await appendMessage(executingAgentId, {
      role: 'assistant',
      content: `[Asked ${targetAgent.name}]: ${args.content}`,
      source: 'telegram'
    });
    await appendMessage(executingAgentId, {
      role: 'user',
      content: `[Reply from ${targetAgent.name}]: ${stored?.reply || replyText || ''}`,
      source: 'telegram'
    });
    await appendMessage(targetAgent.id, {
      role: 'user',
      content: `[Request from ${senderName}]: ${args.content}`,
      source: 'telegram'
    });
    await appendMessage(targetAgent.id, {
      role: 'assistant',
      content: `[Replied to ${senderName}]: ${stored?.reply || replyText || ''}`,
      source: 'telegram'
    });

    logAction('Agent Asked', `Asked ${targetAgent.name} and got reply.`, 'info', executingAgentId);
    return { success: true, from: targetAgent.name, role: targetAgent.role, reply: stored?.reply || replyText };
  } catch (e: any) {
    mutateStore(s => {
      const m = s.messages.find(x => x.id === messageId);
      if (m) { m.status = 'delivered'; m.reply = `Error: ${e.message}`; m.repliedAt = now; }
    });
    return { success: false, error: `Failed to get response from ${targetAgent.name}: ${e.message}` };
  } finally {
    mutateStore(s => {
      const a = s.agents.find(x => x.id === targetAgent.id);
      if (a) a.activeSessions = Math.max(0, (a.activeSessions || 0) - 1);
    });
    chainProcessNext(targetAgent);
  }
}
