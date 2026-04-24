import { mutateStore, getStore } from './store';
import { Agent, TaskRisk, TaskPriority } from '../types';
import { OpenCodeChatSession } from './opencode';

const TELEGRAM_API = 'https://api.telegram.org/bot';

interface BotState {
  token: string;
  offset: number;
  isActive: boolean;
  abortController: AbortController;
}

const runningBots: Map<string, BotState> = new Map();

export function startTelegramManager() {
  // Watch store for agents with bot tokens and start/stop accordingly
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

    const systemInstruction = `You are ${agentInfo.name}, an AI Agent in a company. Your role is ${agentInfo.role}. 
Description: ${agentInfo.description}
Skills: ${agentInfo.skills.join(', ')}

You are communicating with the user/boss via Telegram. 
Help them manage the company, answer questions, or use your tools to perform actions like creating tasks or hiring new agents.
Be concise, professional, and act in-character!`;

    const chatSession = new OpenCodeChatSession(systemInstruction);
    let response = await chatSession.sendMessage(text);
    let replyText = response.text;

    while (response.toolCalls && response.toolCalls.length > 0) {
      const results = [];
      for (const call of response.toolCalls) {
        const args = JSON.parse(call.function.arguments);
        const result = await executeTool(call.function.name, args, agentId);
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

    const res = await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: finalReply })
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

async function executeTool(name: string, args: any, executingAgentId: string): Promise<any> {
  const state = getStore();

  if (name === 'create_agent') {
    let parentId = undefined;
    if (args.managerName) {
      const parent = state.agents.find(a => a.name.toLowerCase().includes(args.managerName.toLowerCase()));
      if (parent) parentId = parent.id;
    }

    mutateStore(s => {
      s.agents.push({
        id: crypto.randomUUID(),
        name: args.name,
        model: args.model,
        role: args.role as any,
        description: args.description,
        skills: args.skills,
        parentId,
        status: 'Idle'
      });
      s.logs.unshift({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        agentId: executingAgentId,
        action: 'Hired Agent via Telegram',
        details: `Hired ${args.name} (${args.role}).`,
        type: 'success'
      });
      if (s.logs.length > 100) s.logs = s.logs.slice(0, 100);
    });

    return { success: true, message: `Agent ${args.name} created successfully.` };
  }

  if (name === 'create_task') {
    let assigneeId = undefined;
    if (args.assigneeName) {
      const assignee = state.agents.find(a => a.name.toLowerCase().includes(args.assigneeName.toLowerCase()));
      if (assignee) assigneeId = assignee.id;
    }

    mutateStore(s => {
      s.tasks.push({
        id: crypto.randomUUID(),
        title: args.title,
        description: args.description,
        status: 'Backlog',
        priority: args.priority as TaskPriority,
        risk: args.risk as TaskRisk,
        tags: args.tags || [],
        assigneeId,
        creatorId: 'user',
        cost: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        comments: [],
        subtasks: []
      });
      s.logs.unshift({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        agentId: executingAgentId,
        action: 'Created Task via Telegram',
        details: `Added task "${args.title}" to board.`,
        type: 'success'
      });
      if (s.logs.length > 100) s.logs = s.logs.slice(0, 100);
    });

    return { success: true, message: `Task "${args.title}" created successfully.` };
  }

  if (name === 'get_company_state') {
    if (args.focus === 'agents') {
      return { agents: state.agents.map(a => ({ name: a.name, role: a.role, status: a.status })) };
    }
    if (args.focus === 'tasks') {
      return { tasks: state.tasks.map(t => ({ title: t.title, status: t.status, assignee: state.agents.find(a => a.id === t.assigneeId)?.name || 'unassigned' })) };
    }
    return {
      agentsCount: state.agents.length,
      tasksCount: state.tasks.length,
      activeTasks: state.tasks.filter(t => t.status === 'In Progress').length
    };
  }

  return { success: false, error: 'Unknown tool' };
}
