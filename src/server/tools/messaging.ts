import { mutateStore, getStore, agentsAreConnected, hasPermission } from '../store';
import { AgentMessage } from '../../types';
import { appendMessage } from '../agent-memory';
import { markdownToTelegramHtml } from '../lib/telegram-formatter';
import { findAgent, logAction } from './agent';

const TELEGRAM_API = 'https://api.telegram.org/bot';

export async function handleSendMessage(args: any, executingAgentId: string): Promise<any> {
  const state = getStore();
  const executingAgent = state.agents.find(a => a.id === executingAgentId);
  const targetAgent = findAgent(args.agentName);
  if (!targetAgent) return { success: false, error: `Agent "${args.agentName}" not found.` };
  if (targetAgent.id === executingAgentId) return { success: false, error: 'You cannot send a message to yourself.' };
  if (!agentsAreConnected(executingAgentId, targetAgent.id, state.agents)) {
    return { success: false, error: `You are not connected to "${targetAgent.name}".` };
  }

  const now = new Date().toISOString();
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
    role: 'system',
    content: `[Sent to ${targetAgent.name}]: ${args.content}`,
    source: 'telegram'
  });

  logAction('Message Sent', `Sent message to ${targetAgent.name} (id: ${message.id}).`, 'info', executingAgentId, 'tool', 'message', state.agents.find(a => a.id === executingAgentId)?.workspaceId, { messageId: message.id, senderName: executingAgent?.name, receiverName: targetAgent.name, channel: 'internal' });

  // Process the recipient immediately so the reply is generated in the same flow.
  try {
    const { processPendingMessage } = await import('../telegram');
    await processPendingMessage(targetAgent);
  } catch (err) {
    console.error(`[Messaging] Failed to process ${targetAgent.name}:`, err);
  }

  return { success: true, messageId: message.id, to: targetAgent.name, status: 'delivered' };
}

export async function handleReplyToMessage(args: any, executingAgentId: string): Promise<any> {
  const state = getStore();
  const executingAgent = state.agents.find(a => a.id === executingAgentId);
  const msg = state.messages.find(m => m.id === args.messageId);
  if (!msg) return { success: false, error: `Message "${args.messageId}" not found.` };
  if (msg.toAgentId !== executingAgentId) return { success: false, error: 'You can only reply to messages addressed to you.' };
  if (msg.status === 'replied') return { success: false, error: 'This message was already replied to.' };

  const now = new Date().toISOString();
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
    mutateStore(s => {
      const m = s.messages.find(x => x.id === args.messageId);
      if (m) m.replyDelivered = true;
    });
  }

  await appendMessage(executingAgentId, {
    role: 'system',
    content: `[Replied to ${sender?.name || msg.fromAgentId}]: ${args.content}`,
    source: 'telegram'
  });
  if (sender) {
    await appendMessage(sender.id, {
      role: 'system',
      content: `[Reply from ${replier}]: ${args.content}`,
      source: 'telegram'
    });
  }

  logAction('Message Replied', `Replied to message from ${sender?.name || msg.fromAgentId}.`, 'info', executingAgentId, 'tool', 'message', state.agents.find(a => a.id === executingAgentId)?.workspaceId, { messageId: args.messageId, senderName: sender?.name, receiverName: replier, channel: 'internal' });
  return { success: true, message: 'Reply sent.' };
}

export async function handleCheckMyInbox(args: any, executingAgentId: string): Promise<any> {
  const state = getStore();
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

export async function handleSendBroadcast(args: any, executingAgentId: string): Promise<any> {
  const state = getStore();
  if (!hasPermission(executingAgentId, 'system:broadcast')) {
    return { success: false, error: 'You do not have system:broadcast permission.' };
  }

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

  logAction('Broadcast Sent', `Broadcast sent to ${sent} agent(s).`, 'info', executingAgentId, 'tool', 'message', state.agents.find(a => a.id === executingAgentId)?.workspaceId, { isBroadcast: true, receiverName: `${sent} agents` });
  return { success: true, message: `Broadcast sent to ${sent} agent(s).` };
}

export async function handleSendTelegramMessage(args: any, executingAgentId: string): Promise<any> {
  const state = getStore();
  const agent = state.agents.find(a => a.id === executingAgentId);
  if (!agent?.telegramConfig?.botToken) {
    return { success: false, error: 'No Telegram bot token configured for this agent. Set up a Telegram bot first.' };
  }

  const targetChatId = args.chatId || agent.telegramConfig.lastChatId;
  if (!targetChatId) {
    return { success: false, error: 'No chat ID available. Chat with the bot via Telegram first to establish a chat ID.' };
  }

  try {
    const telegramText = markdownToTelegramHtml(args.message);
    const res = await fetch(`${TELEGRAM_API}${agent.telegramConfig.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: targetChatId, text: telegramText, parse_mode: 'HTML' })
    });

    if (!res.ok) {
      const errData = await res.json();
      return { success: false, error: `Telegram Send Error: ${errData.description}` };
    }

    logAction('Telegram Message Sent', `Sent message to chat ${targetChatId}.`, 'info', executingAgentId, 'tool', 'telegram', state.agents.find(a => a.id === executingAgentId)?.workspaceId, { chatId: targetChatId, agentName: agent.name, direction: 'out' });
    return { success: true, message: `Message sent to Telegram chat ${targetChatId}.` };
  } catch (e: any) {
    return { success: false, error: `Failed to send Telegram message: ${e.message}` };
  }
}
