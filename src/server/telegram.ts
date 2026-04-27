import { mutateStore, getStore, agentsAreConnected } from './store';
import { Agent, Task, TaskRisk, TaskPriority, TaskStatus, AgentStatus, Comment, AgentMessage } from '../types';
import { OpenCodeChatSession } from './opencode';
import { loadMemory, createMemory, appendMessage, buildSystemPrompt, writePersonalityFile } from './agent-memory';
import { marked, Renderer } from 'marked';
import type { Tokens } from 'marked';

const TELEGRAM_API = 'https://api.telegram.org/bot';

const TELEGRAM_FORMATTING_RULES = `# TELEGRAM FORMATTING RULES — Must follow strictly

You are responding via Telegram messenger. Use standard Markdown. The system will convert it automatically.

Supported formatting:
- **bold** or __bold__
- _italic_ or *italic*
- \`inline code\`
- \`\`\` code blocks \`\`\`
- [links](URL)
- - bullet lists
- 1. numbered lists

NOT supported (will be removed):
- Headers (#, ##, etc.)
- Tables (|--|)
- Images
- HTML tags/entities
- Strikethrough

Rules:
- Use "- " or "• " for bullet list items. Each item must start at the BEGINNING of a new line.
- NEVER use indentation alone as a list marker — always include the "-" or "1." prefix.
- Keep responses concise (1-3 sentences per paragraph).
- Use short paragraphs, bullet lists, and numbers to organize information.
- When asked to "list" or "show" agents, tasks, crons, or any collection: ALWAYS enumerate each item individually on its own line with relevant details (name, role, status, etc.). NEVER reply with just a count or summary when the user asks for a list.`;

interface BotState {
  token: string;
  offset: number;
  isActive: boolean;
  abortController: AbortController;
}

const runningBots: Map<string, BotState> = new Map();
const busyAgents = new Set<string>();

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fixIndentedLists(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  let inCodeBlock = false;

  for (const line of lines) {
    const trimmed = line.trimStart();

    if (trimmed.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      result.push(line);
      continue;
    }

    if (inCodeBlock) {
      result.push(line);
      continue;
    }

    if (/^\s{2,}\S/.test(line) && !/^\s*[-•*+\d]/.test(line)) {
      result.push('- ' + line.trim());
    } else {
      result.push(line);
    }
  }

  return result.join('\n');
}

// Telegram HTML supports: <b>, <i>, <u>, <s>, <code>, <pre>, <a>, <tg-spoiler>.
// Lists must be plain "- item" / "1. item" lines (Telegram renders them natively).
class TelegramRenderer extends Renderer {
  paragraph({ tokens }: Tokens.Paragraph): string {
    return this.parser.parseInline(tokens) + '\n\n';
  }
  strong({ tokens }: Tokens.Strong): string {
    return `<b>${this.parser.parseInline(tokens)}</b>`;
  }
  em({ tokens }: Tokens.Em): string {
    return `<i>${this.parser.parseInline(tokens)}</i>`;
  }
  codespan({ text }: Tokens.Codespan): string {
    return `<code>${escapeHtml(text)}</code>`;
  }
  code({ text }: Tokens.Code): string {
    return `<pre>${escapeHtml(text)}</pre>\n\n`;
  }
  link({ href, tokens }: Tokens.Link): string {
    return `<a href="${href}">${this.parser.parseInline(tokens)}</a>`;
  }
  list({ items, ordered, start }: Tokens.List): string {
    const startNum = typeof start === 'number' ? start : 1;
    return items.map((item, i) => {
      const content = item.tokens ? this.parser.parseInline(item.tokens) : item.text;
      const prefix = ordered ? `${startNum + i}.` : '-';
      return `${prefix} ${content}\n`;
    }).join('') + '\n';
  }
  listitem({ text, tokens }: Tokens.ListItem): string {
    const content = tokens ? this.parser.parseInline(tokens) : text;
    return `- ${content}\n`;
  }
  heading({ tokens }: Tokens.Heading): string {
    return `<b>${this.parser.parseInline(tokens)}</b>\n\n`;
  }
  blockquote({ tokens }: Tokens.Blockquote): string {
    return this.parser.parse(tokens);
  }
  del({ tokens }: Tokens.Del): string {
    return this.parser.parseInline(tokens);
  }
  image(): string { return ''; }
  hr(): string { return ''; }
  table(): string { return ''; }
  html(): string { return ''; }
  br(): string { return '\n'; }
  checkbox(): string { return ''; }
  space(): string { return ''; }
}

marked.setOptions({ renderer: new TelegramRenderer() });

function markdownToTelegramHtml(text: string): string {
  const fixed = fixIndentedLists(text);
  const html = marked.parse(fixed, { async: false }) as string;
  return html.replace(/\n{3,}/g, '\n\n').trim();
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

    const undelivered = store.messages.filter(m =>
      m.fromAgentId === agentId && m.status === 'replied' && m.reply &&
      !m.replyDelivered && m.chatId == chatId && m.botToken
    );
    for (const msg of undelivered.slice(-3)) {
      try {
        const replyText = markdownToTelegramHtml(
          `Ответ от ${store.agents.find(a => a.id === msg.toAgentId)?.name || 'Agent'}: ${msg.reply}`
        );
        await fetch(`${TELEGRAM_API}${msg.botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: msg.chatId, text: replyText, parse_mode: 'HTML' })
        });
        mutateStore(s2 => {
          const m2 = s2.messages.find(x => x.id === msg.id);
          if (m2) m2.replyDelivered = true;
        });
      } catch (_) {}
    }

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

// --- Tool Implementations ---

function findAgent(name: string): Agent | undefined {
  const state = getStore();
  return state.agents.find(a => a.name.toLowerCase().includes(name.toLowerCase()));
}

function findTask(title: string): Task | undefined {
  const state = getStore();
  return state.tasks.find(t => t.title.toLowerCase().includes(title.toLowerCase()));
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

export async function executeTool(name: string, args: any, executingAgentId: string, token?: string): Promise<any> {
  const state = getStore();
  const now = new Date().toISOString();

  const executingAgent = state.agents.find(a => a.id === executingAgentId);

  // Every agent must belong to a workspace to act
  if (!executingAgent?.workspaceId) {
    return { success: false, error: 'You are not assigned to a workspace and cannot perform actions.' };
  }

  // --- CREATE AGENT ---
  if (name === 'create_agent') {
    let parentId = undefined;
    if (args.managerName) {
      const parent = findAgent(args.managerName);
      if (!parent) return { success: false, error: `Manager "${args.managerName}" not found.` };
      if (!agentsAreConnected(executingAgentId, parent.id, state.agents)) {
        return { success: false, error: `You can only create agents under your manager or collaborator. You are not connected to "${parent.name}".` };
      }
      parentId = parent.id;
    }

    const newAgentId = crypto.randomUUID();
    const workspaceId = executingAgent.workspaceId;

    mutateStore(s => {
      s.agents.push({
        id: newAgentId,
        name: args.name,
        slug: args.slug || args.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
        role: args.role as any,
        skills: args.skills || [],
        parentId,
        status: 'Idle',
        workspaceId
      });
      const ws = s.workspaces.find(w => w.id === workspaceId);
      if (ws && !ws.agentIds.includes(newAgentId)) {
        ws.agentIds.push(newAgentId);
      }
    });

    const newAgent = getStore().agents.find(a => a.id === newAgentId);
    if (newAgent) {
      const ws = getStore().workspaces.find(w => w.id === workspaceId);
      createMemory(newAgent, ws);
    }

    if (args.soul) writePersonalityFile(newAgentId, 'SOUL.md', args.soul);
    if (args.identity) writePersonalityFile(newAgentId, 'IDENTITY.md', args.identity);
    if (args.roleDoc) writePersonalityFile(newAgentId, 'ROLE.md', args.roleDoc);

    logAction('Hired Agent via Telegram', `Hired ${args.name} (${args.role}) into workspace.`, 'success', executingAgentId);
    return { success: true, message: `Agent ${args.name} created successfully in your workspace.` };
  }

  // --- CREATE TASK ---
  if (name === 'create_task') {
    let assigneeId = undefined;
    if (args.assigneeName) {
      const assignee = findAgent(args.assigneeName);
      if (!assignee) return { success: false, error: `Agent "${args.assigneeName}" not found.` };
      if (assignee.id !== executingAgentId && !agentsAreConnected(executingAgentId, assignee.id, state.agents)) {
        return { success: false, error: `You can only assign tasks to agents you have a relationship with. "${assignee.name}" is not connected to you.` };
      }
      assigneeId = assignee.id;
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
        createdAt: now,
        updatedAt: now,
        comments: [],
        subtasks: []
      });
    });
    logAction('Created Task via Telegram', `Added task "${args.title}" to board.`, 'success', executingAgentId);
    return { success: true, message: `Task "${args.title}" created successfully.` };
  }

  // --- GET COMPANY STATE ---
  if (name === 'get_company_state') {
    if (args.focus === 'agents') {
      const connected = state.agents.filter(a => agentsAreConnected(executingAgentId, a.id, state.agents));
      return { agents: connected.map(a => ({ name: a.name, role: a.role, status: a.status })) };
    }
    if (args.focus === 'tasks') {
      return { tasks: state.tasks.map(t => ({ title: t.title, status: t.status, assignee: state.agents.find(a => a.id === t.assigneeId)?.name || 'unassigned' })) };
    }
    return {
      agentsCount: state.agents.length,
      tasksCount: state.tasks.length,
      activeTasks: state.tasks.filter(t => t.status === 'In Progress').length,
      totalCost: state.totalCost
    };
  }

  // --- MOVE TASK ---
  if (name === 'move_task') {
    const task = findTask(args.taskTitle);
    if (!task) return { success: false, error: `Task "${args.taskTitle}" not found.` };

    mutateStore(s => {
      const t = s.tasks.find(x => x.id === task.id);
      if (t) {
        t.status = args.newStatus as TaskStatus;
        t.updatedAt = now;
      }
    });
    logAction('Task Moved', `Moved "${task.title}" to ${args.newStatus}.`, 'info', executingAgentId);
    return { success: true, message: `Task "${task.title}" moved to ${args.newStatus}.` };
  }

  // --- ASSIGN TASK ---
  if (name === 'assign_task') {
    const task = findTask(args.taskTitle);
    if (!task) return { success: false, error: `Task "${args.taskTitle}" not found.` };
    const agent = findAgent(args.agentName);
    if (!agent) return { success: false, error: `Agent "${args.agentName}" not found.` };
    if (agent.id !== executingAgentId && !agentsAreConnected(executingAgentId, agent.id, state.agents)) {
      return { success: false, error: `You can only assign tasks to agents you have a relationship with (manager/subordinate or collaborator). "${agent.name}" is not connected to you.` };
    }

    mutateStore(s => {
      const t = s.tasks.find(x => x.id === task.id);
      if (t) {
        t.assigneeId = agent.id;
        t.updatedAt = now;
      }
    });
    logAction('Task Assigned', `Assigned "${task.title}" to ${agent.name}.`, 'info', executingAgentId);
    return { success: true, message: `Task "${task.title}" assigned to ${agent.name}.` };
  }

  // --- UPDATE TASK ---
  if (name === 'update_task') {
    const task = findTask(args.taskTitle);
    if (!task) return { success: false, error: `Task "${args.taskTitle}" not found.` };

    mutateStore(s => {
      const t = s.tasks.find(x => x.id === task.id);
      if (!t) return;
      if (args.priority) t.priority = args.priority as TaskPriority;
      if (args.risk) t.risk = args.risk as TaskRisk;
      if (args.description) t.description = args.description;
      if (args.tags) t.tags = args.tags;
      t.updatedAt = now;
    });
    logAction('Task Updated', `Updated "${task.title}".`, 'info', executingAgentId);
    return { success: true, message: `Task "${task.title}" updated.` };
  }

  // --- DELETE TASK ---
  if (name === 'delete_task') {
    const task = findTask(args.taskTitle);
    if (!task) return { success: false, error: `Task "${args.taskTitle}" not found.` };

    mutateStore(s => {
      s.tasks = s.tasks.filter(t => t.id !== task.id);
    });
    logAction('Task Deleted', `Deleted "${task.title}".`, 'warning', executingAgentId);
    return { success: true, message: `Task "${task.title}" deleted.` };
  }

  // --- ADD TASK COMMENT ---
  if (name === 'add_task_comment') {
    const task = findTask(args.taskTitle);
    if (!task) return { success: false, error: `Task "${args.taskTitle}" not found.` };
    const agent = state.agents.find(a => a.id === executingAgentId);

    if (task.assigneeId && !agentsAreConnected(executingAgentId, task.assigneeId, state.agents)) {
      const assignee = state.agents.find(a => a.id === task.assigneeId);
      return { success: false, error: `You can only comment on tasks assigned to agents you are connected to. "${assignee?.name || task.assigneeId}" is not connected to you.` };
    }

    mutateStore(s => {
      const t = s.tasks.find(x => x.id === task.id);
      if (t) {
        t.comments.push({
          id: crypto.randomUUID(),
          authorId: executingAgentId,
          authorName: agent?.name || 'System',
          content: args.content,
          createdAt: now,
          type: (args.type || 'message') as Comment['type']
        });
        t.updatedAt = now;
      }
    });
    logAction('Comment Added', `Added comment to "${task.title}".`, 'info', executingAgentId);
    return { success: true, message: `Comment added to "${task.title}".` };
  }

  // --- CREATE SUBTASK ---
  if (name === 'create_subtask') {
    const task = findTask(args.taskTitle);
    if (!task) return { success: false, error: `Task "${args.taskTitle}" not found.` };

    mutateStore(s => {
      const t = s.tasks.find(x => x.id === task.id);
      if (t) {
        t.subtasks.push({ id: crypto.randomUUID(), title: args.subtaskTitle, completed: false });
        t.updatedAt = now;
      }
    });
    logAction('Subtask Created', `Added subtask "${args.subtaskTitle}" to "${task.title}".`, 'info', executingAgentId);
    return { success: true, message: `Subtask "${args.subtaskTitle}" created.` };
  }

  // --- COMPLETE SUBTASK ---
  if (name === 'complete_subtask') {
    const task = findTask(args.taskTitle);
    if (!task) return { success: false, error: `Task "${args.taskTitle}" not found.` };
    const subtask = task.subtasks.find(s => s.title.toLowerCase().includes(args.subtaskTitle.toLowerCase()));
    if (!subtask) return { success: false, error: `Subtask "${args.subtaskTitle}" not found.` };

    mutateStore(s => {
      const t = s.tasks.find(x => x.id === task.id);
      if (t) {
        const st = t.subtasks.find(x => x.id === subtask.id);
        if (st) st.completed = true;
        t.updatedAt = now;
      }
    });
    logAction('Subtask Completed', `Completed "${args.subtaskTitle}" in "${task.title}".`, 'success', executingAgentId);
    return { success: true, message: `Subtask "${args.subtaskTitle}" completed.` };
  }

  // --- ADD TASK TAG ---
  if (name === 'add_task_tag') {
    const task = findTask(args.taskTitle);
    if (!task) return { success: false, error: `Task "${args.taskTitle}" not found.` };

    mutateStore(s => {
      const t = s.tasks.find(x => x.id === task.id);
      if (t && !t.tags.includes(args.tag)) {
        t.tags.push(args.tag);
        t.updatedAt = now;
      }
    });
    return { success: true, message: `Tag "${args.tag}" added to "${task.title}".` };
  }

  // --- REMOVE TASK TAG ---
  if (name === 'remove_task_tag') {
    const task = findTask(args.taskTitle);
    if (!task) return { success: false, error: `Task "${args.taskTitle}" not found.` };

    mutateStore(s => {
      const t = s.tasks.find(x => x.id === task.id);
      if (t) {
        t.tags = t.tags.filter(tag => tag !== args.tag);
        t.updatedAt = now;
      }
    });
    return { success: true, message: `Tag "${args.tag}" removed from "${task.title}".` };
  }

  // --- UPDATE AGENT ---
  if (name === 'update_agent') {
    const agent = findAgent(args.agentName);
    if (!agent) return { success: false, error: `Agent "${args.agentName}" not found.` };

    mutateStore(s => {
      const a = s.agents.find(x => x.id === agent.id);
      if (!a) return;
      if (args.newName) a.name = args.newName;
      if (args.model) a.model = args.model;
      if (args.role) a.role = args.role as any;
      if (args.description) a.description = args.description;
      if (args.skills) a.skills = args.skills;
    });
    logAction('Agent Updated', `Updated ${agent.name}.`, 'info', executingAgentId);
    return { success: true, message: `Agent "${agent.name}" updated.` };
  }

  // --- DELETE AGENT ---
  if (name === 'delete_agent') {
    const agent = findAgent(args.agentName);
    if (!agent) return { success: false, error: `Agent "${args.agentName}" not found.` };

    mutateStore(s => {
      s.agents = s.agents.filter(a => a.id !== agent.id);
    });
    logAction('Agent Removed', `Removed ${agent.name}.`, 'warning', executingAgentId);
    return { success: true, message: `Agent "${agent.name}" removed.` };
  }

  // --- SET AGENT STATUS ---
  if (name === 'set_agent_status') {
    const agent = findAgent(args.agentName);
    if (!agent) return { success: false, error: `Agent "${args.agentName}" not found.` };

    mutateStore(s => {
      const a = s.agents.find(x => x.id === agent.id);
      if (a) a.status = args.status as AgentStatus;
    });
    logAction('Status Changed', `Set ${agent.name} to ${args.status}.`, 'info', executingAgentId);
    return { success: true, message: `Agent "${agent.name}" status set to ${args.status}.` };
  }

  // --- GET AGENT DETAILS ---
  if (name === 'get_agent_details') {
    const agent = findAgent(args.agentName);
    if (!agent) return { success: false, error: `Agent "${args.agentName}" not found.` };
    const tasks = state.tasks.filter(t => t.assigneeId === agent.id);
    const manager = agent.parentId ? state.agents.find(a => a.id === agent.parentId) : null;
    const collaborators = (agent.collaborators || []).map(id => state.agents.find(a => a.id === id)).filter(Boolean) as Agent[];
    const subordinates = state.agents.filter(a => a.parentId === agent.id);

    let connection: string;
    if (agent.id === executingAgentId) {
      connection = 'self';
    } else if (agent.parentId === executingAgentId) {
      connection = 'subordinate';
    } else if (executingAgent?.parentId === agent.id) {
      connection = 'manager';
    } else if (agentsAreConnected(executingAgentId, agent.id, state.agents)) {
      connection = 'collaborator';
    } else {
      connection = 'none';
    }

    return {
      agent: {
        name: agent.name,
        role: agent.role,
        status: agent.status,
        skills: agent.skills,
        description: agent.description,
        manager: manager ? { name: manager.name, role: manager.role } : null,
        collaborators: collaborators.map(c => ({ name: c.name, role: c.role })),
        subordinates: subordinates.map(s => ({ name: s.name, role: s.role })),
      },
      connection,
      tasks: tasks.map(t => ({ title: t.title, status: t.status, priority: t.priority }))
    };
  }

  // --- GET MY CONNECTIONS ---
  if (name === 'get_my_connections') {
    const manager = executingAgent?.parentId ? state.agents.find(a => a.id === executingAgent.parentId) : null;
    const subordinates = state.agents.filter(a => a.parentId === executingAgentId);
    const collaborators = (executingAgent?.collaborators || [])
      .map(id => state.agents.find(a => a.id === id))
      .filter(Boolean) as Agent[];

    return {
      manager: manager ? { name: manager.name, role: manager.role, status: manager.status } : null,
      subordinates: subordinates.map(a => ({ name: a.name, role: a.role, status: a.status })),
      collaborators: collaborators.map(a => ({ name: a.name, role: a.role, status: a.status })),
      totalConnections: (manager ? 1 : 0) + subordinates.length + collaborators.length
    };
  }

  // --- RESOLVE APPROVAL ---
  if (name === 'resolve_approval') {
    let result: any = {};
    mutateStore(s => {
      const approval = s.approvals.find(a => a.id === args.approvalId);
      if (!approval) {
        result = { success: false, error: 'Approval not found.' };
        return;
      }

      approval.status = args.approved ? 'approved' : 'rejected';
      const fixSubtask = { id: crypto.randomUUID(), title: 'Fix issues based on feedback', completed: false };

      if (approval.taskId) {
        const task = s.tasks.find(t => t.id === approval.taskId);
        if (task) {
          task.status = args.approved ? 'Review' : 'In Progress';
          task.updatedAt = now;
          if (!args.approved) {
            task.subtasks.push(fixSubtask);
          }
          task.comments.push({
            id: crypto.randomUUID(),
            authorId: 'user',
            authorName: 'Admin (You)',
            content: args.approved ? `Approval granted for: ${approval.action}. Proceeding.` : 'Approval denied. Please revise according to comments.',
            createdAt: now,
            type: 'action'
          });
        }
      }

      if (approval.agentId) {
        const agent = s.agents.find(a => a.id === approval.agentId);
        if (agent) agent.status = 'Idle';
      }

      s.logs.unshift({
        id: crypto.randomUUID(),
        timestamp: now,
        agentId: 'user',
        action: args.approved ? 'Approval Granted' : 'Approval Rejected',
        details: `User ${args.approved ? 'approved' : 'rejected'} action: ${approval.action}`,
        type: args.approved ? 'success' : 'error'
      });
      if (s.logs.length > 100) s.logs = s.logs.slice(0, 100);

      result = { success: true, message: `Approval ${args.approved ? 'granted' : 'denied'}.` };
    });
    return result;
  }

  // --- SEARCH TASKS ---
  if (name === 'search_tasks') {
    let tasks = state.tasks;
    if (args.status) tasks = tasks.filter(t => t.status.toLowerCase() === args.status.toLowerCase());
    if (args.priority) tasks = tasks.filter(t => t.priority.toLowerCase() === args.priority.toLowerCase());
    if (args.tag) tasks = tasks.filter(t => t.tags.some(tag => tag.toLowerCase().includes(args.tag.toLowerCase())));
    if (args.assigneeName) {
      const agent = findAgent(args.assigneeName);
      if (agent) tasks = tasks.filter(t => t.assigneeId === agent.id);
    }
    return {
      count: tasks.length,
      tasks: tasks.map(t => ({
        title: t.title,
        status: t.status,
        priority: t.priority,
        assignee: state.agents.find(a => a.id === t.assigneeId)?.name || 'unassigned',
        tags: t.tags
      }))
    };
  }

  // --- GET TASK DETAILS ---
  if (name === 'get_task_details') {
    const task = findTask(args.taskTitle);
    if (!task) return { success: false, error: `Task "${args.taskTitle}" not found.` };
    const assignee = state.agents.find(a => a.id === task.assigneeId);
    return {
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      risk: task.risk,
      assignee: assignee?.name || 'unassigned',
      tags: task.tags,
      cost: task.cost,
      subtasks: task.subtasks,
      comments: task.comments,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt
    };
  }

  // --- SEND BROADCAST ---
  if (name === 'send_broadcast') {
    const botsWithTokens = state.agents.filter(a =>
      a.telegramConfig?.botToken && a.telegramConfig?.lastChatId &&
      agentsAreConnected(executingAgentId, a.id, state.agents)
    );

    if (botsWithTokens.length === 0) {
      return { success: false, error: 'No connected agents with Telegram bots configured.' };
    }

    let sent = 0;

    for (const agent of botsWithTokens) {
      try {
        const broadcastText = markdownToTelegramHtml(
          `📢 Broadcast from ${state.agents.find(a => a.id === executingAgentId)?.name || 'Admin'}:\n\n${args.message}`
        );
        await fetch(`${TELEGRAM_API}${agent.telegramConfig!.botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: agent.telegramConfig!.lastChatId,
            text: broadcastText,
            parse_mode: 'HTML'
          })
        });
        sent++;
      } catch (e) {
        console.error(`[Broadcast] Failed to send to ${agent.name}:`, e);
      }
    }

    logAction('Broadcast Sent', `Broadcast sent to ${sent} agent(s).`, 'info', executingAgentId);
    return { success: true, message: `Broadcast sent to ${sent} agent(s).` };
  }

  // --- SEND MESSAGE (async, one-way) ---
  if (name === 'send_message') {
    const targetAgent = findAgent(args.agentName);
    if (!targetAgent) return { success: false, error: `Agent "${args.agentName}" not found.` };
    if (targetAgent.id === executingAgentId) return { success: false, error: 'You cannot send a message to yourself.' };
    if (!agentsAreConnected(executingAgentId, targetAgent.id, state.agents)) {
      return { success: false, error: `You are not connected to "${targetAgent.name}".` };
    }

    const message: AgentMessage = {
      id: crypto.randomUUID(),
      fromAgentId: executingAgentId,
      toAgentId: targetAgent.id,
      content: args.content,
      status: 'pending',
      createdAt: now,
      chatId: executingAgent?.telegramConfig?.lastChatId,
      botToken: executingAgent?.telegramConfig?.botToken,
    };

    mutateStore(s => {
      s.messages.push(message);
    });

    await appendMessage(executingAgentId, {
      role: 'assistant',
      content: `[Sent to ${targetAgent.name}]: ${args.content}`,
      source: 'telegram'
    });
    await appendMessage(targetAgent.id, {
      role: 'user',
      content: `[From ${executingAgent?.name || 'Unknown'}]: ${args.content}`,
      source: 'telegram'
    });

    logAction('Message Sent', `Sent message to ${targetAgent.name} (id: ${message.id}).`, 'info', executingAgentId);
    return { success: true, messageId: message.id, to: targetAgent.name, status: 'delivered' };
  }

  // --- ASK AGENT (sync, waits for reply) ---
  if (name === 'ask_agent') {
    const targetAgent = findAgent(args.agentName);
    if (!targetAgent) return { success: false, error: `Agent "${args.agentName}" not found.` };
    if (targetAgent.id === executingAgentId) return { success: false, error: 'You cannot ask yourself.' };
    if (!agentsAreConnected(executingAgentId, targetAgent.id, state.agents)) {
      return { success: false, error: `You are not connected to "${targetAgent.name}".` };
    }
    if (busyAgents.has(targetAgent.id)) {
      return { success: false, error: `${targetAgent.name} is busy processing another request. Try again later.` };
    }

    busyAgents.add(targetAgent.id);

    const senderName = executingAgent?.name || 'Unknown';
    const senderRole = executingAgent?.role || 'Agent';
    const chatId = executingAgent?.telegramConfig?.lastChatId;
    const botToken = executingAgent?.telegramConfig?.botToken;

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

    const targetSystemPrompt = buildSystemPrompt(targetAgent) +
      `\n\nYou are responding to a request from ${senderName} (${senderRole}), a connected agent. Use reply_to_message("${messageId}", content) to send your reply. You have full tool access — do whatever work is needed before replying.`;

    const TIMEOUT_MS = 120000;
    const startTime = Date.now();

    try {
      const chatSession = new OpenCodeChatSession(targetSystemPrompt);
      const userMessage = `Request from ${senderName} (${senderRole}):\n\n${args.content}\n\nDo the work, then call reply_to_message("${messageId}", "your response") to reply.`;
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
          try {
            await fetch(`${TELEGRAM_API}${botToken}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chat_id: chatId, text: `Ответ от ${targetAgent.name}: ${finalReply}`, parse_mode: 'HTML' })
            });
            mutateStore(s2 => {
              const m2 = s2.messages.find(x => x.id === messageId);
              if (m2) m2.replyDelivered = true;
            });
          } catch (_) {}
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
      busyAgents.delete(targetAgent.id);
    }
  }

  // --- REPLY TO MESSAGE ---
  if (name === 'reply_to_message') {
    const msg = state.messages.find(m => m.id === args.messageId);
    if (!msg) return { success: false, error: `Message "${args.messageId}" not found.` };
    if (msg.toAgentId !== executingAgentId) return { success: false, error: 'You can only reply to messages addressed to you.' };
    if (msg.status === 'replied') return { success: false, error: 'This message was already replied to.' };

    mutateStore(s => {
      const m = s.messages.find(x => x.id === args.messageId);
      if (m) {
        m.reply = args.content;
        m.status = 'replied';
        m.repliedAt = now;
      }
    });

    const sender = state.agents.find(a => a.id === msg.fromAgentId);
    const replier = executingAgent?.name || 'Agent';

    if (msg.botToken && msg.chatId) {
      try {
        const replyText = markdownToTelegramHtml(
          `Ответ от ${replier}: ${args.content}`
        );
        await fetch(`${TELEGRAM_API}${msg.botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: msg.chatId, text: replyText, parse_mode: 'HTML' })
        });
        mutateStore(s => {
          const m = s.messages.find(x => x.id === args.messageId);
          if (m) m.replyDelivered = true;
        });
      } catch (e) {
        console.error(`[reply_to_message] Failed to deliver to Telegram:`, e);
      }
    }

    await appendMessage(executingAgentId, {
      role: 'assistant',
      content: `[Replied to ${sender?.name || msg.fromAgentId}]: ${args.content}`,
      source: 'telegram'
    });
    if (sender) {
      await appendMessage(sender.id, {
        role: 'user',
        content: `[Reply from ${replier}]: ${args.content}`,
        source: 'telegram'
      });
    }

    logAction('Message Replied', `Replied to message from ${sender?.name || msg.fromAgentId}.`, 'info', executingAgentId);
    return { success: true, message: 'Reply sent.' };
  }

  // --- CHECK MY INBOX ---
  if (name === 'check_my_inbox') {
    const incoming = state.messages.filter(m =>
      m.toAgentId === executingAgentId && m.status !== 'replied'
    ).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const sent = state.messages.filter(m =>
      m.fromAgentId === executingAgentId
    ).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20);

    const incomings = incoming.map(m => ({
      id: m.id,
      from: state.agents.find(a => a.id === m.fromAgentId)?.name || m.fromAgentId,
      content: m.content,
      status: m.status,
      createdAt: m.createdAt,
    }));

    const outgoing = sent.map(m => ({
      id: m.id,
      to: state.agents.find(a => a.id === m.toAgentId)?.name || m.toAgentId,
      content: m.content,
      status: m.status,
      reply: m.reply || undefined,
      createdAt: m.createdAt,
    }));

    return {
      pendingIncoming: incomings.length,
      incoming: incomings,
      recentOutgoing: outgoing,
    };
  }

  // --- GENERATE REPORT ---
  if (name === 'generate_report') {
    let report = '';
    if (args.type === 'dashboard' || args.type === 'all') {
      report += `DASHBOARD\n`;
      report += `Total Agents: ${state.agents.length}\n`;
      report += `Total Tasks: ${state.tasks.length}\n`;
      report += `Active Tasks: ${state.tasks.filter(t => t.status === 'In Progress').length}\n`;
      report += `Pending Approvals: ${state.approvals.filter(a => a.status === 'pending').length}\n`;
      report += `Total Cost: $${state.totalCost.toFixed(2)}\n\n`;
    }
    if (args.type === 'agents' || args.type === 'all') {
      report += `AGENTS\n`;
      state.agents.forEach(a => {
        const taskCount = state.tasks.filter(t => t.assigneeId === a.id).length;
        report += `- ${a.name} (${a.role}) — ${a.status} — ${taskCount} tasks\n`;
      });
      report += `\n`;
    }
    if (args.type === 'tasks' || args.type === 'all') {
      report += `TASKS BY STATUS\n`;
      const statuses = ['Backlog', 'Planned', 'In Progress', 'Review', 'Needs Approval', 'Done'];
      statuses.forEach(st => {
        const count = state.tasks.filter(t => t.status === st).length;
        report += `${st}: ${count}\n`;
      });
      report += `\n`;
    }
    if (args.type === 'costs' || args.type === 'all') {
      report += `COSTS\n`;
      report += `Total: $${state.totalCost.toFixed(2)}\n`;
      const expensiveTasks = state.tasks.filter(t => t.cost > 0).sort((a, b) => b.cost - a.cost).slice(0, 5);
      if (expensiveTasks.length) {
        report += `Top 5 expensive tasks:\n`;
        expensiveTasks.forEach(t => report += `- ${t.title}: $${t.cost.toFixed(2)}\n`);
      }
    }
    return { success: true, report: report.trim() };
  }

  // --- SET AGENT PERSONALITY ---
  if (name === 'set_agent_personality') {
    const agent = findAgent(args.agentName);
    if (!agent) return { success: false, error: `Agent "${args.agentName}" not found.` };

    const updated: string[] = [];
    if (args.soul) { writePersonalityFile(agent.id, 'SOUL.md', args.soul); updated.push('SOUL'); }
    if (args.identity) { writePersonalityFile(agent.id, 'IDENTITY.md', args.identity); updated.push('IDENTITY'); }
    if (args.role) { writePersonalityFile(agent.id, 'ROLE.md', args.role); updated.push('ROLE'); }

    if (updated.length === 0) {
      return { success: false, error: 'At least one of soul, identity, or role must be provided.' };
    }

    logAction('Personality Updated', `Updated ${updated.join(', ')} for ${agent.name}.`, 'success', executingAgentId);
    return { success: true, message: `Updated ${updated.join(', ')} for ${agent.name}.` };
  }

  // --- CREATE CRON ---
  if (name === 'create_cron') {
    const agent = findAgent(args.agentName);
    if (!agent) return { success: false, error: `Agent "${args.agentName}" not found.` };

    const cronModule = await import('./cron');
    const job = cronModule.createCronJob({
      name: args.name,
      description: args.description,
      agentId: agent.id,
      workspaceId: executingAgent.workspaceId!,
      schedule: args.schedule,
      prompt: args.prompt,
      enabled: true,
    });

    logAction('Cron Created', `Created cron "${args.name}" for ${agent.name} (${args.schedule}).`, 'success', executingAgentId);
    return { success: true, message: `Cron job "${args.name}" created for ${agent.name} with schedule "${args.schedule}".`, job };
  }

  // --- LIST CRONS ---
  if (name === 'list_crons') {
    const cronModule = await import('./cron');
    const jobs = cronModule.listCronJobs(executingAgent.workspaceId);
    return {
      count: jobs.length,
      crons: jobs.map(j => ({
        id: j.id,
        name: j.name,
        agentName: state.agents.find(a => a.id === j.agentId)?.name || 'unknown',
        schedule: j.schedule,
        enabled: j.enabled,
        lastStatus: j.lastStatus,
        lastRunAt: j.lastRunAt,
        lastResult: j.lastResult,
      }))
    };
  }

  // --- DELETE CRON ---
  if (name === 'delete_cron') {
    const cronModule = await import('./cron');
    const all = cronModule.listCronJobs(executingAgent.workspaceId);
    const job = all.find(j => j.name.toLowerCase().includes(args.cronName.toLowerCase()));
    if (!job) return { success: false, error: `Cron "${args.cronName}" not found in your workspace.` };

    cronModule.deleteCronJob(job.id);
    logAction('Cron Deleted', `Deleted cron "${job.name}".`, 'warning', executingAgentId);
    return { success: true, message: `Cron job "${job.name}" deleted.` };
  }

  // --- UPDATE CRON ---
  if (name === 'update_cron') {
    const cronModule = await import('./cron');
    const all = cronModule.listCronJobs(executingAgent.workspaceId);
    const job = all.find(j => j.name.toLowerCase().includes(args.cronName.toLowerCase()));
    if (!job) return { success: false, error: `Cron "${args.cronName}" not found in your workspace.` };

    const updates: any = {};
    if (args.schedule !== undefined) updates.schedule = args.schedule;
    if (args.prompt !== undefined) updates.prompt = args.prompt;
    if (args.enabled !== undefined) updates.enabled = args.enabled;
    if (args.description !== undefined) updates.description = args.description;

    const updated = cronModule.updateCronJob(job.id, updates);
    logAction('Cron Updated', `Updated cron "${job.name}".`, 'info', executingAgentId);
    return { success: true, message: `Cron job "${job.name}" updated.`, job: updated };
  }

  // --- RUN CRON NOW ---
  if (name === 'run_cron_now') {
    const cronModule = await import('./cron');
    const all = cronModule.listCronJobs(executingAgent.workspaceId);
    const job = all.find(j => j.name.toLowerCase().includes(args.cronName.toLowerCase()));
    if (!job) return { success: false, error: `Cron "${args.cronName}" not found in your workspace.` };

    const result = await cronModule.runCronNow(job.id);
    if (result.success) {
      logAction('Cron Run Manually', `Manually triggered cron "${job.name}".`, 'info', executingAgentId);
      return { success: true, message: `Cron "${job.name}" executed successfully.` };
    }
    return { success: false, error: result.error };
  }

  return { success: false, error: 'Unknown tool' };
}
