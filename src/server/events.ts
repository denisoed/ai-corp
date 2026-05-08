import { createChatSession } from './llm';
import { appendMessage, buildSystemPrompt } from './agent-memory';
import { getStore, mutateStore, agentsAreConnected } from './store';
import { getEventDefinition, getSupportedEventTypes } from './event-registry';
import type { Agent, DomainEvent, EventSubscription, Task, ApprovalRequest } from '../types';

const SUPPORTED_EVENTS = getSupportedEventTypes();

function logEvent(action: string, details: string, type: 'info' | 'success' | 'warning' | 'error' = 'info', agentId = 'system', metadata?: Record<string, unknown>): void {
  mutateStore(s => {
    s.logs.unshift({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      agentId,
      action,
      details,
      type,
      source: 'events',
      category: 'event',
      metadata,
    });
    if (s.logs.length > 100) s.logs = s.logs.slice(0, 100);
  });
}

function summarizeEvent(event: DomainEvent): string {
  const payload = event.payload as Record<string, unknown>;
  const pieces: string[] = [];
  if (payload.taskTitle) pieces.push(`task="${String(payload.taskTitle)}"`);
  if (payload.fromStatus && payload.toStatus) pieces.push(`${String(payload.fromStatus)}→${String(payload.toStatus)}`);
  if (payload.authorName) pieces.push(`author="${String(payload.authorName)}"`);
  if (payload.assigneeId) pieces.push(`assignee="${String(payload.assigneeId)}"`);
  return pieces.length > 0 ? pieces.join(', ') : 'no summary fields';
}

function summarizeSubscription(subscription: EventSubscription): string {
  const filters: string[] = [];
  if (subscription.filters.taskId) filters.push(`taskId=${subscription.filters.taskId}`);
  if (subscription.filters.fromStatus) filters.push(`from=${subscription.filters.fromStatus}`);
  if (subscription.filters.toStatus) filters.push(`to=${subscription.filters.toStatus}`);
  if (subscription.filters.assigneeId) filters.push(`assigneeId=${subscription.filters.assigneeId}`);
  return [
    `id=${subscription.id.slice(0, 8)}`,
    `agentId=${subscription.agentId}`,
    `eventType=${subscription.eventType}`,
    `channel=${subscription.channel}`,
    subscription.enabled ? 'enabled' : 'disabled',
    filters.length > 0 ? `filters(${filters.join(', ')})` : 'filters(none)',
  ].join(', ');
}

function matchesSubscription(subscription: EventSubscription, event: DomainEvent): boolean {
  if (!subscription.enabled) return false;
  if (!SUPPORTED_EVENTS.includes(event.type)) return false;
  if (subscription.eventType !== event.type) return false;
  if (subscription.filters.taskId && subscription.filters.taskId !== event.taskId) return false;

  const payload = event.payload as Record<string, unknown>;
  if (subscription.filters.fromStatus && payload.fromStatus !== subscription.filters.fromStatus) return false;
  if (subscription.filters.toStatus && payload.toStatus !== subscription.filters.toStatus) return false;
  if (subscription.filters.assigneeId && payload.assigneeId !== subscription.filters.assigneeId) return false;
  return true;
}

function buildNotificationPrompt(agent: Agent, event: DomainEvent, task: Task, subscription?: EventSubscription): string {
  return [
    buildSystemPrompt(agent),
    'You are generating a short Telegram notification for a subscribed event.',
    'Write like a helpful teammate giving a quick update in Telegram.',
    'Sound natural, warm, and direct. Avoid robotic wording.',
    'If the task is done, mention it plainly and briefly. If there is context worth sharing, include it in one short sentence.',
    'Do not invent facts. Use only the provided event payload.',
    'Keep it concise: 2 to 5 short sentences.',
    `Event type: ${event.type}`,
    `Task: ${task.title}`,
    `Task description: ${task.description}`,
    `Task status: ${task.status}`,
    subscription?.instructions ? `Subscriber instructions: ${subscription.instructions}` : '',
    `Event payload: ${JSON.stringify(event.payload, null, 2)}`,
  ].join('\n\n');
}

function generateNotificationText(event: DomainEvent, task: Task): string {
  const p = event.payload as Record<string, unknown>;
  const taskTitle = String(p.taskTitle || task.title);

  switch (event.type) {
    case 'task.status.changed': {
      const from = String(p.fromStatus || '?');
      const to = String(p.toStatus || '?');
      const summary = typeof p.summary === 'string' && p.summary.trim()
        ? `\nSummary: ${p.summary.slice(0, 200)}`
        : '';
      if (to === 'Done') return `✅ "${taskTitle}" is Complete!${summary}`;
      if (to === 'Review') return `👀 "${taskTitle}" moved to Review${summary}`;
      if (to === 'In Progress') return `🔄 "${taskTitle}" is now In Progress`;
      if (to === 'Blocked') return `🚫 "${taskTitle}" has been Blocked`;
      if (to === 'Needs Approval') return `⏳ "${taskTitle}" needs approval`;
      return `📋 "${taskTitle}" moved: ${from} → ${to}${summary}`;
    }
    case 'task.completed': {
      const summary = typeof p.summary === 'string' && p.summary.trim()
        ? `\n${p.summary.slice(0, 200)}`
        : '';
      return `✅ "${taskTitle}" is Complete!${summary}`;
    }
    case 'task.comment.added': {
      const author = String(p.authorName || 'Someone');
      const content = String(p.content || '').slice(0, 150);
      return `💬 ${author} on "${taskTitle}": ${content}`;
    }
    case 'task.assignee.changed': {
      return `👤 Task "${taskTitle}" reassigned`;
    }
    case 'pipeline.stage.started':
      return `🚀 Pipeline stage "${String(p.stageName || '?')}" started`;
    case 'pipeline.stage.completed':
      return `✅ Pipeline stage "${String(p.stageName || '?')}" completed`;
    case 'pipeline.stage.failed':
      return `❌ Pipeline stage "${String(p.stageName || '?')}" failed`;
    case 'pipeline.completed':
      return `🎉 Pipeline completed!`;
    case 'pipeline.failed':
      return `💥 Pipeline failed`;
    default:
      return `📌 Update on "${taskTitle}"`;
  }
}

async function sendTelegramNotification(agent: Agent, text: string): Promise<void> {
  const botToken = agent.telegramConfig?.botToken;
  const chatId = agent.telegramConfig?.lastChatId;
  if (!botToken || !chatId) return;

  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.description || 'Failed to send Telegram notification');
  }
}

export function createTaskStatusChangedEvent(task: Task, fromStatus: string, toStatus: string, actorAgentId?: string): DomainEvent {
  return {
    id: crypto.randomUUID(),
    type: 'task.status.changed',
    workspaceId: undefined,
    taskId: task.id,
    createdAt: new Date().toISOString(),
    payload: {
      taskId: task.id,
      taskTitle: task.title,
      fromStatus,
      toStatus,
      actorAgentId,
      assigneeId: task.assigneeId,
      completedAt: task.updatedAt,
      summary: task.comments.slice(-3).map(comment => comment.content).join('\n'),
    }
  };
}

export function createTaskCompletedEvent(task: Task, actorAgentId?: string): DomainEvent {
  return {
    id: crypto.randomUUID(),
    type: 'task.completed',
    taskId: task.id,
    createdAt: new Date().toISOString(),
    payload: {
      taskId: task.id,
      taskTitle: task.title,
      actorAgentId,
      assigneeId: task.assigneeId,
      completedAt: task.updatedAt,
      summary: task.comments.slice(-3).map(comment => comment.content).join('\n'),
    }
  };
}

export function createTaskCommentAddedEvent(task: Task, comment: { authorId: string; authorName: string; content: string; type?: string }, actorAgentId?: string): DomainEvent {
  return {
    id: crypto.randomUUID(),
    type: 'task.comment.added',
    taskId: task.id,
    createdAt: new Date().toISOString(),
    payload: {
      taskId: task.id,
      taskTitle: task.title,
      actorAgentId,
      authorId: comment.authorId,
      authorName: comment.authorName,
      content: comment.content,
      commentType: comment.type || 'message',
      assigneeId: task.assigneeId,
      updatedAt: task.updatedAt,
    }
  };
}

export function createTaskAssigneeChangedEvent(task: Task, previousAssigneeId: string | undefined, nextAssigneeId: string | undefined, actorAgentId?: string): DomainEvent {
  return {
    id: crypto.randomUUID(),
    type: 'task.assignee.changed',
    taskId: task.id,
    createdAt: new Date().toISOString(),
    payload: {
      taskId: task.id,
      taskTitle: task.title,
      actorAgentId,
      previousAssigneeId,
      nextAssigneeId,
      assigneeId: nextAssigneeId,
      updatedAt: task.updatedAt,
    }
  };
}

export function createApprovalRequestedEvent(approval: ApprovalRequest, taskTitle?: string): DomainEvent {
  return {
    id: crypto.randomUUID(),
    type: 'approval.requested',
    taskId: approval.taskId,
    createdAt: new Date().toISOString(),
    payload: {
      approvalId: approval.id,
      action: approval.action,
      details: approval.details,
      risk: approval.risk,
      requesterAgentId: approval.agentId,
      approverAgentId: approval.approverAgentId!,
      taskTitle,
    },
  };
}

export async function publishEvent(event: DomainEvent, contextAgentId?: string): Promise<void> {
  const state = getStore();
  const def = getEventDefinition(event.type);
  const task = event.taskId ? state.tasks.find(t => t.id === event.taskId) : undefined;
  const eventMeta = {
    eventType: event.type,
    eventLabel: def?.label,
    taskId: task?.id,
    taskTitle: task?.title,
  };
  logEvent(
    'Event Published',
    `${def?.label || event.type} [${event.id.slice(0, 8)}] -> ${summarizeEvent(event)}`,
    'info',
    'system',
    eventMeta
  );

  const subscriptions = state.subscriptions.filter(sub => matchesSubscription(sub, event));
  logEvent(
    'Event Routed',
    `${def?.label || event.type} matched ${subscriptions.length} subscription(s).`,
    subscriptions.length > 0 ? 'success' : 'warning',
    'system',
    { ...eventMeta, subscriberCount: subscriptions.length }
  );
  if (subscriptions.length === 0) return;

  const effectiveAgentId = contextAgentId || task?.assigneeId || undefined;

  for (const subscription of subscriptions) {
    const agent = state.agents.find(a => a.id === subscription.agentId);
    if (!agent) {
      logEvent('Event Delivery Skipped', `Subscription ${subscription.id.slice(0, 8)} skipped: agent not found.`, 'warning', 'system', eventMeta);
      continue;
    }
    if (event.type !== 'approval.requested' && !agentsAreConnected(subscription.agentId, effectiveAgentId || subscription.agentId, state.agents)) {
      logEvent(
        'Event Delivery Skipped',
        `Subscription ${subscription.id.slice(0, 8)} for ${agent.name} skipped: agent is not connected to task context.`,
        'warning',
        agent.id,
        { ...eventMeta, agentName: agent.name }
      );
      continue;
    }

    if (event.type === 'approval.requested') {
      const { runApprovalAutopilot } = await import('./task-autopilot');
      const approval = state.approvals.find(a => a.id === event.payload?.approvalId);
      if (approval && approval.status === 'pending') {
        runApprovalAutopilot(approval).catch(err => {
          logEvent('Approval Autopilot Error', `runApprovalAutopilot failed for approval ${approval.id}: ${err.message}`, 'error', 'system');
        });
      }
      if (subscription.oneshot) {
        mutateStore(s => {
          s.subscriptions = s.subscriptions.filter(sub => sub.id !== subscription.id);
        });
      }
      continue;
    }

    if (!task) {
      logEvent('Event Dropped', `${def?.label || event.type} had no task context and was skipped.`, 'warning', 'system', eventMeta);
      return;
    }

    const deliveryMeta = { ...eventMeta, agentName: agent.name, deliveryChannel: subscription.channel };
    try {
      logEvent(
        'Event Delivery Started',
        `Delivering ${def?.label || event.type} to ${agent.name}. ${summarizeSubscription(subscription)}`,
        'info',
        agent.id,
        deliveryMeta
      );
      let text: string;
      if (subscription.instructions) {
        const chatSession = createChatSession(agent, buildNotificationPrompt(agent, event, task, subscription));
        const response = await chatSession.sendMessage(
          `Generate a Telegram notification for this event:\n${JSON.stringify(event, null, 2)}`
        );
        text = response.text.trim();
        if (!text) {
          logEvent('Event Delivery Failed', `LLM returned empty text for ${agent.name} on ${def?.label || event.type}.`, 'error', agent.id, deliveryMeta);
          continue;
        }
      } else {
        text = generateNotificationText(event, task);
      }

      if (subscription.channel === 'telegram') {
        await sendTelegramNotification(agent, text);
      }

      await appendMessage(agent.id, {
        role: 'assistant',
        content: text,
        source: 'system'
      });

      logEvent(
        'Event Delivery Completed',
        `Delivered ${def?.label || event.type} to ${agent.name} via ${subscription.channel}. Message: ${text.slice(0, 220)}`,
        'success',
        agent.id,
        { ...deliveryMeta, deliveryStatus: 'success' }
      );

      if (subscription.oneshot) {
        mutateStore(s => {
          s.subscriptions = s.subscriptions.filter(sub => sub.id !== subscription.id);
        });
        logEvent('OneShot Subscription Consumed', `Auto-deleted subscription ${subscription.id.slice(0, 8)} after first delivery.`, 'info', agent.id);
      }
    } catch (error: any) {
      logEvent(
        'Event Delivery Failed',
        `Failed to deliver ${def?.label || event.type} to ${agent?.name || subscription.agentId}: ${error.message}`,
        'error',
        subscription.agentId,
        deliveryMeta
      );
    }
  }
}

export function createTaskCompletionSubscription(agentId: string, taskId: string): EventSubscription {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    agentId,
    eventType: 'task.status.changed',
    channel: 'telegram',
    enabled: true,
    createdAt: now,
    updatedAt: now,
    filters: {
      taskId,
      toStatus: 'Done',
    }
  };
}

export function createTaskEventSubscription(
  agentId: string,
  taskId: string,
  eventType: DomainEvent['type'],
  filters: Partial<EventSubscription['filters']> = {},
  instructions?: string,
  oneshot = true
): EventSubscription {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    agentId,
    eventType,
    channel: 'telegram',
    enabled: true,
    createdAt: now,
    updatedAt: now,
    instructions,
    oneshot,
    filters: {
      taskId,
      ...filters,
    }
  };
}

export function addSubscription(subscription: EventSubscription): EventSubscription {
  mutateStore(s => {
    s.subscriptions.unshift(subscription);
  });
  return subscription;
}

export function findTaskByTitle(title: string): Task | undefined {
  const state = getStore();
  return state.tasks.find(task => task.title.toLowerCase().includes(title.toLowerCase()));
}

export async function handleSubscribeToEvent(args: { eventType?: DomainEvent['type']; taskTitle?: string; taskId?: string; channel?: 'telegram' | 'in_app'; instructions?: string; oneshot?: boolean }, agentId: string): Promise<{ success: boolean; subscription?: EventSubscription; error?: string }> {
  const state = getStore();
  const agent = state.agents.find(a => a.id === agentId);
  if (!agent) return { success: false, error: 'Agent not found.' };

  const task = args.taskId
    ? state.tasks.find(t => t.id === args.taskId)
    : args.taskTitle
      ? findTaskByTitle(args.taskTitle)
      : undefined;
  if (!task) return { success: false, error: `Task "${args.taskTitle || args.taskId || 'unknown'}" not found.` };

  if (task.assigneeId && !agentsAreConnected(agentId, task.assigneeId, state.agents)) {
    return { success: false, error: `You are not connected to the assignee of "${task.title}".` };
  }

  const eventType = args.eventType || 'task.status.changed';
  const subscription = createTaskEventSubscription(
    agentId,
    task.id,
    eventType,
    eventType === 'task.status.changed' ? { toStatus: 'Done' } : {},
    args.instructions,
    args.oneshot
  );
  if (args.channel) subscription.channel = args.channel;

  addSubscription(subscription);
  logEvent(
    'Subscription Created',
    `${agent.name} subscribed to ${task.title}. ${summarizeSubscription(subscription)}`,
    'success',
    agentId,
    { eventType, taskId: task.id, taskTitle: task.title, agentName: agent.name, channel: subscription.channel }
  );
  return { success: true, subscription };
}

export function listSubscriptions(agentId: string): EventSubscription[] {
  const state = getStore();
  return state.subscriptions.filter(sub => sub.agentId === agentId);
}

export function updateSubscription(agentId: string, subscriptionId: string, patch: Partial<Pick<EventSubscription, 'enabled' | 'channel' | 'instructions'>> & { filters?: Partial<EventSubscription['filters']> }): { success: boolean; subscription?: EventSubscription; error?: string } {
  let updated: EventSubscription | undefined;
  mutateStore(s => {
    const sub = s.subscriptions.find(item => item.id === subscriptionId && item.agentId === agentId);
    if (!sub) return;
    if (typeof patch.enabled === 'boolean') sub.enabled = patch.enabled;
    if (patch.channel) sub.channel = patch.channel;
    if (patch.instructions !== undefined) sub.instructions = patch.instructions;
    if (patch.filters) sub.filters = { ...sub.filters, ...patch.filters };
    sub.updatedAt = new Date().toISOString();
    updated = sub;
  });
  if (!updated) return { success: false, error: 'Subscription not found.' };
  logEvent('Subscription Updated', `${agentId} updated subscription ${subscriptionId.slice(0, 8)}. ${summarizeSubscription(updated)}`, 'success', agentId, { eventType: updated.eventType, channel: updated.channel });
  return { success: true, subscription: updated };
}

export function deleteSubscription(agentId: string, subscriptionId: string): { success: boolean; error?: string } {
  let removed = false;
  mutateStore(s => {
    const before = s.subscriptions.length;
    s.subscriptions = s.subscriptions.filter(sub => !(sub.id === subscriptionId && sub.agentId === agentId));
    removed = s.subscriptions.length !== before;
  });
  if (removed) {
    logEvent('Subscription Deleted', `${agentId} deleted subscription ${subscriptionId.slice(0, 8)}.`, 'success', agentId, { subscriptionId });
  }
  return removed ? { success: true } : { success: false, error: 'Subscription not found.' };
}
