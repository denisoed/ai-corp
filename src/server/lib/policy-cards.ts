export interface PolicyCard {
  id: string;
  triggers: string[];
  content: string;
}

const ALL_CARDS: PolicyCard[] = [
  {
    id: 'autopilot.operating',
    triggers: ['autopilot'],
    content: [
      'Keep the user informed by writing task comments at meaningful milestones.',
      'Move the task across columns as work progresses.',
      'Use create_subtask when decomposing work.',
      'Use add_task_tag or remove_task_tag if it helps with tracking.',
      'If you need a decision or approval, call request_approval with approverAgentName pointing to the relevant agent (Manager, Reviewer, DevOps).',
      'If blocked, move the task to Blocked and explain why in a comment.',
      'When complete, move the task to Done and add a final summary comment.',
    ].join(' '),
  },
  {
    id: 'autopilot.efficiency',
    triggers: ['autopilot', 'pipeline'],
    content: [
      'Batch multiple independent read-only operations into a single response to minimize round-trips.',
      'You already have your permissions and workspace context — use that before calling get_agent_permissions again.',
      'NEVER call the same read tool with the same arguments twice in a row.',
      'Check current task status before calling move_task — if already at target, skip.',
      'You may NOT escalate your own permissions via grant_permission_to_agent. Call request_approval instead.',
      'If run_command returns "needs_approval", do NOT retry — the command executes after approval.',
      'If request_approval returns "already_approved" or "already_pending", proceed without retrying.',
    ].join(' '),
  },
  {
    id: 'pipeline.operating',
    triggers: ['pipeline'],
    content: [
      'Work on the stage task until it reaches Done.',
      'Use tools to accomplish the stage goal.',
      'If you need approval, call request_approval with approverAgentName set to a relevant agent.',
      'When complete, move the task to Done and write a summary comment.',
    ].join(' '),
  },
  {
    id: 'pipeline.focus',
    triggers: ['pipeline'],
    content: [
      'Do NOT call grant_permission_to_agent to escalate your own permissions — request approval.',
      'Check task status before calling move_task — skip if already at target.',
      'Focus on the specific stage goal. Do not wander into unrelated directories or tasks.',
    ].join(' '),
  },
  {
    id: 'pipeline.commands',
    triggers: ['pipeline', 'autopilot'],
    content: [
      'If run_command returns status "needs_approval", do NOT retry the same command.',
      'If request_approval returns "already_approved" or "already_pending", proceed without retrying.',
      'Wait for command results before proceeding.',
    ].join(' '),
  },
  {
    id: 'telegram.critical',
    triggers: ['telegram'],
    content: [
      'When the user asks you to do something involving other agents, you MUST use the available tools to execute the request.',
      'Do NOT just acknowledge — take action using tools.',
      'After executing tools, always reply to the user with a summary of what was done.',
    ].join(' '),
  },
  {
    id: 'telegram.queued',
    triggers: ['telegram-queued', 'telegram-ask'],
    content: [
      'Focus ONLY on the specific request below. Do NOT modify permissions, roles, or system configuration.',
      'If a tool fails with a permission error, skip it and move on — do not retry.',
      'Your goal is to complete the actual work and reply, not to fix infrastructure.',
    ].join(' '),
  },
  {
    id: 'telegram.ask',
    triggers: ['telegram-ask'],
    content: [
      'Focus only on the specific request. Do not attempt to fix permissions, roles, or system config.',
      'If a permission tool fails, skip it.',
    ].join(' '),
  },
  {
    id: 'cron.notify',
    triggers: ['cron'],
    content: [
      'After completing your work, use send_telegram_message to notify the user about the results.',
    ].join(' '),
  },
];

export function selectPolicyCards(context: string): string {
  const cards = ALL_CARDS.filter(c => c.triggers.includes(context));
  if (cards.length === 0) return '';
  return cards.map(c => c.content).join('\n');
}
