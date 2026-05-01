import { getStore } from '../store';

export { findAgent, logAction } from './agent';

/**
 * Dispatches tool execution to the appropriate handler module.
 * Each handler receives (args, executingAgentId, token?) and returns a result object.
 */
export async function executeTool(name: string, args: any, executingAgentId: string, token?: string): Promise<any> {
  // Workspace check for all tools
  const state = getStore();
  const executingAgent = state.agents.find(a => a.id === executingAgentId);
  if (!executingAgent?.workspaceId) {
    return { success: false, error: 'You are not assigned to a workspace and cannot perform actions.' };
  }

  // Tool routing
  switch (name) {
    // Agent tools
    case 'create_agent': return (await import('./agent')).handleCreateAgent(args, executingAgentId);
    case 'update_agent': return (await import('./agent')).handleUpdateAgent(args, executingAgentId);
    case 'delete_agent': return (await import('./agent')).handleDeleteAgent(args, executingAgentId);
    case 'set_agent_status': return (await import('./agent')).handleSetAgentStatus(args, executingAgentId);
    case 'get_agent_details': return (await import('./agent')).handleGetAgentDetails(args, executingAgentId);
    case 'get_my_connections': return (await import('./agent')).handleGetMyConnections(args, executingAgentId);
    case 'set_agent_personality': return (await import('./agent')).handleSetAgentPersonality(args, executingAgentId);

    // Task tools
    case 'create_task': return (await import('./task')).handleCreateTask(args, executingAgentId);
    case 'move_task': return (await import('./task')).handleMoveTask(args, executingAgentId);
    case 'assign_task': return (await import('./task')).handleAssignTask(args, executingAgentId);
    case 'update_task': return (await import('./task')).handleUpdateTask(args, executingAgentId);
    case 'delete_task': return (await import('./task')).handleDeleteTask(args, executingAgentId);
    case 'add_task_comment': return (await import('./task')).handleAddTaskComment(args, executingAgentId);
    case 'create_subtask': return (await import('./task')).handleCreateSubtask(args, executingAgentId);
    case 'complete_subtask': return (await import('./task')).handleCompleteSubtask(args, executingAgentId);
    case 'add_task_tag': return (await import('./task')).handleAddTaskTag(args, executingAgentId);
    case 'remove_task_tag': return (await import('./task')).handleRemoveTaskTag(args, executingAgentId);
    case 'subscribe_to_event': return (await import('../events')).handleSubscribeToEvent(args, executingAgentId);
    case 'list_subscriptions': return (await import('../events')).listSubscriptions(executingAgentId);
    case 'update_subscription': return (await import('../events')).updateSubscription(executingAgentId, args.subscriptionId, {
      enabled: args.enabled,
      channel: args.channel,
      instructions: args.instructions,
      filters: args.filters
    });
    case 'delete_subscription': return (await import('../events')).deleteSubscription(executingAgentId, args.subscriptionId);
    case 'search_tasks': return (await import('./task')).handleSearchTasks(args, executingAgentId);
    case 'get_task_details': return (await import('./task')).handleGetTaskDetails(args, executingAgentId);
    case 'get_company_state': return (await import('./task')).handleGetCompanyState(args, executingAgentId);
    case 'generate_report': return (await import('./task')).handleGenerateReport(args, executingAgentId);

    // Connection tools
    case 'add_connection': return (await import('./connection')).handleAddConnection(args, executingAgentId);
    case 'remove_connection': return (await import('./connection')).handleRemoveConnection(args, executingAgentId);
    case 'update_connection': return (await import('./connection')).handleUpdateConnection(args, executingAgentId);
    case 'resolve_approval': return (await import('./connection')).handleResolveApproval(args, executingAgentId);
    case 'request_approval': return (await import('../task-autopilot')).requestApproval({
      agentId: executingAgentId,
      taskTitle: args.taskTitle,
      action: args.action,
      risk: args.risk,
      estimatedCost: args.estimatedCost,
      details: `${args.question}${args.taskTitle ? ` (Task: ${args.taskTitle})` : ''}`
    });

    // Messaging tools
    case 'send_message': return (await import('./messaging')).handleSendMessage(args, executingAgentId);
    case 'reply_to_message': return (await import('./messaging')).handleReplyToMessage(args, executingAgentId);
    case 'check_my_inbox': return (await import('./messaging')).handleCheckMyInbox(args, executingAgentId);
    case 'send_broadcast': return (await import('./messaging')).handleSendBroadcast(args, executingAgentId);
    case 'send_telegram_message': return (await import('./messaging')).handleSendTelegramMessage(args, executingAgentId);
    case 'ask_agent': return (await import('../telegram')).handleAskAgent(args, executingAgentId, token);

    // File tools
    case 'run_command': return (await import('./command')).handleRunCommand(args, executingAgentId);
    case 'read_file': return (await import('./file')).handleReadFile(args, executingAgentId);
    case 'write_file': return (await import('./file')).handleWriteFile(args, executingAgentId);
    case 'delete_file': return (await import('./file')).handleDeleteFile(args, executingAgentId);
    case 'list_files': return (await import('./file')).handleListFiles(args, executingAgentId);

    // Role tools
    case 'create_role': return (await import('./role')).handleCreateRole(args, executingAgentId);
    case 'delete_role': return (await import('./role')).handleDeleteRole(args, executingAgentId);
    case 'update_role': return (await import('./role')).handleUpdateRole(args, executingAgentId);
    case 'grant_permission_to_role': return (await import('./role')).handleGrantPermissionToRole(args, executingAgentId);
    case 'revoke_permission_from_role': return (await import('./role')).handleRevokePermissionFromRole(args, executingAgentId);
    case 'list_roles': return (await import('./role')).handleListRoles(args, executingAgentId);
    case 'get_role': return (await import('./role')).handleGetRole(args, executingAgentId);
    case 'assign_role': return (await import('./role')).handleAssignRole(args, executingAgentId);
    case 'revoke_role': return (await import('./role')).handleRevokeRole(args, executingAgentId);
    case 'get_agent_permissions': return (await import('./role')).handleGetAgentPermissions(args, executingAgentId);
    case 'list_permissions': return (await import('./role')).handleListPermissions(args, executingAgentId);
    case 'grant_permission_to_agent': return (await import('./role')).handleGrantPermissionToAgent(args, executingAgentId);
    case 'revoke_permission_from_agent': return (await import('./role')).handleRevokePermissionFromAgent(args, executingAgentId);

    // Web tools
    case 'web_search': return (await import('./web')).handleWebSearch(args, executingAgentId);
    case 'fetch_url': return (await import('./web')).handleFetchUrl(args, executingAgentId);

    // Cron tools
    case 'create_cron': return (await import('./cron')).handleCreateCron(args, executingAgentId);
    case 'list_crons': return (await import('./cron')).handleListCrons(args, executingAgentId);
    case 'delete_cron': return (await import('./cron')).handleDeleteCron(args, executingAgentId);
    case 'update_cron': return (await import('./cron')).handleUpdateCron(args, executingAgentId);
    case 'run_cron_now': return (await import('./cron')).handleRunCronNow(args, executingAgentId);

    default:
      return { success: false, error: 'Unknown tool' };
  }
}
