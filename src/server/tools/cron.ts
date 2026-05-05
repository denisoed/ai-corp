import { getStore } from '../store';
import { hasPermission } from '../store';
import { findAgent, logAction } from './agent';

export async function handleCreateCron(args: any, executingAgentId: string): Promise<any> {
  if (!hasPermission(executingAgentId, 'system:manage_crons')) {
    return { success: false, error: 'You do not have system:manage_crons permission.' };
  }

  const state = getStore();
  const executingAgent = state.agents.find(a => a.id === executingAgentId);
  const agent = findAgent(args.agentName);
  if (!agent) return { success: false, error: `Agent "${args.agentName}" not found.` };

  const cronModule = await import('../cron');
  const job = cronModule.createCronJob({
    name: args.name,
    description: args.description,
    agentId: agent.id,
    workspaceId: executingAgent!.workspaceId!,
    schedule: args.schedule,
    prompt: args.prompt,
    enabled: true,
  });

  logAction('Cron Created', `Created cron "${args.name}" for ${agent.name} (${args.schedule}).`, 'success', executingAgentId, 'tool', 'cron', executingAgent?.workspaceId, { cronName: args.name, targetAgentName: agent.name, schedule: args.schedule, prompt: args.prompt });
  return { success: true, message: `Cron job "${args.name}" created for ${agent.name} with schedule "${args.schedule}".`, job };
}

export async function handleListCrons(args: any, executingAgentId: string): Promise<any> {
  const state = getStore();
  const executingAgent = state.agents.find(a => a.id === executingAgentId);
  const cronModule = await import('../cron');
  const jobs = cronModule.listCronJobs(executingAgent?.workspaceId);
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

export async function handleDeleteCron(args: any, executingAgentId: string): Promise<any> {
  if (!hasPermission(executingAgentId, 'system:manage_crons')) {
    return { success: false, error: 'You do not have system:manage_crons permission.' };
  }

  const state = getStore();
  const executingAgent = state.agents.find(a => a.id === executingAgentId);
  const cronModule = await import('../cron');
  const all = cronModule.listCronJobs(executingAgent?.workspaceId);
  const job = all.find(j => j.name.toLowerCase().includes(args.cronName.toLowerCase()));
  if (!job) return { success: false, error: `Cron "${args.cronName}" not found in your workspace.` };

  cronModule.deleteCronJob(job.id);
  logAction('Cron Deleted', `Deleted cron "${job.name}".`, 'warning', executingAgentId, 'tool', 'cron', executingAgent?.workspaceId, { cronName: job.name });
  return { success: true, message: `Cron job "${job.name}" deleted.` };
}

export async function handleUpdateCron(args: any, executingAgentId: string): Promise<any> {
  if (!hasPermission(executingAgentId, 'system:manage_crons')) {
    return { success: false, error: 'You do not have system:manage_crons permission.' };
  }

  const state = getStore();
  const executingAgent = state.agents.find(a => a.id === executingAgentId);
  const cronModule = await import('../cron');
  const all = cronModule.listCronJobs(executingAgent?.workspaceId);
  const job = all.find(j => j.name.toLowerCase().includes(args.cronName.toLowerCase()));
  if (!job) return { success: false, error: `Cron "${args.cronName}" not found in your workspace.` };

  const updates: any = {};
  if (args.schedule !== undefined) updates.schedule = args.schedule;
  if (args.prompt !== undefined) updates.prompt = args.prompt;
  if (args.enabled !== undefined) updates.enabled = args.enabled;
  if (args.description !== undefined) updates.description = args.description;

  const updated = cronModule.updateCronJob(job.id, updates);
  logAction('Cron Updated', `Updated cron "${job.name}".`, 'info', executingAgentId, 'tool', 'cron', executingAgent?.workspaceId, { cronName: job.name });
  return { success: true, message: `Cron job "${job.name}" updated.`, job: updated };
}

export async function handleRunCronNow(args: any, executingAgentId: string): Promise<any> {
  if (!hasPermission(executingAgentId, 'system:manage_crons')) {
    return { success: false, error: 'You do not have system:manage_crons permission.' };
  }

  const state = getStore();
  const executingAgent = state.agents.find(a => a.id === executingAgentId);
  const cronModule = await import('../cron');
  const all = cronModule.listCronJobs(executingAgent?.workspaceId);
  const job = all.find(j => j.name.toLowerCase().includes(args.cronName.toLowerCase()));
  if (!job) return { success: false, error: `Cron "${args.cronName}" not found in your workspace.` };

  const result = await cronModule.runCronNow(job.id);
  if (result.success) {
    logAction('Cron Run Manually', `Manually triggered cron "${job.name}".`, 'info', executingAgentId, 'tool', 'cron', executingAgent?.workspaceId, { cronName: job.name });
    return { success: true, message: `Cron "${job.name}" executed successfully.` };
  }
  return { success: false, error: result.error };
}
