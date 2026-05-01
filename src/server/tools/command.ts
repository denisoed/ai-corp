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

  return runCommandInWorkspace({
    agentId: executingAgentId,
    command,
    args: commandArgs,
    cwd: typeof args.cwd === 'string' ? args.cwd : '.',
    env: args.env && typeof args.env === 'object' ? args.env : undefined,
    timeoutMs: typeof args.timeoutMs === 'number' ? args.timeoutMs : undefined,
    detach: Boolean(args.detach)
  });
}
