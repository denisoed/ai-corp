import { hasPermission, getStore } from '../store';
import { runCommandInWorkspace } from '../command-runner';

export async function handleRunCommand(args: any, executingAgentId: string): Promise<any> {
  const state = getStore();
  const agent = state.agents.find(a => a.id === executingAgentId);
  if (!agent?.workspaceId) {
    return { success: false, error: 'You are not assigned to a workspace and cannot run commands.' };
  }
  if (!hasPermission(executingAgentId, 'system:run_commands')) {
    return { success: false, error: 'You do not have system:run_commands permission.' };
  }

  const command = typeof args.command === 'string' ? args.command : '';
  const commandArgs = Array.isArray(args.args) ? args.args.map(String) : [];
  if (!command.trim()) {
    return { success: false, error: 'command is required.' };
  }

  const cwd = typeof args.cwd === 'string' ? args.cwd : '.';

  const existing = state.commandRuns.find(r =>
    r.agentId === executingAgentId &&
    r.command === command &&
    JSON.stringify(r.args) === JSON.stringify(commandArgs) &&
    r.cwd.toLowerCase() === cwd.toLowerCase() &&
    (r.status === 'needs_approval' || r.status === 'pending' || r.status === 'running')
  );
  if (existing) {
    return {
      success: false,
      status: existing.status,
      commandRunId: existing.id,
      reason: existing.reason,
      approvalRequestId: existing.approvalRequestId,
      message: `Command "${command} ${commandArgs.join(' ')}" is already pending (${existing.status}). Do NOT retry — it will execute automatically once approved.`
    };
  }

  const result = await runCommandInWorkspace({
    agentId: executingAgentId,
    command,
    args: commandArgs,
    cwd: typeof args.cwd === 'string' ? args.cwd : '.',
    env: args.env && typeof args.env === 'object' ? args.env : undefined,
    timeoutMs: typeof args.timeoutMs === 'number' ? args.timeoutMs : undefined,
    detach: Boolean(args.detach)
  });

  if (result.status === 'needs_approval') {
    result.status = 'needs_approval';
    (result as any).message = 'Command is pending approval. Do NOT retry — it will execute automatically once approved.';
  }

  return result;
}
