import type { PermissionType } from '../../types';
import { getEffectivePermissions, getStore } from '../store';
import { companyTools } from './tool-definitions';
import type { Tool } from '../llm/types';

const TOOL_PERMISSION_MAP: Record<string, PermissionType[]> = {
  read_file: ['file:read'],
  write_file: ['file:write'],
  delete_file: ['file:delete'],
  list_files: ['file:list', 'folder:read'],
  create_folder: ['folder:write'],
  delete_folder: ['folder:delete'],

  run_command: ['system:run_commands'],

  delete_agent: ['system:manage_agents'],

  send_broadcast: ['system:broadcast'],

  resolve_approval: ['system:approve_work'],

  create_role: ['system:manage_roles'],
  delete_role: ['system:manage_roles'],
  update_role: ['system:manage_roles'],
  grant_permission_to_role: ['system:manage_roles'],
  revoke_permission_from_role: ['system:manage_roles'],
  assign_role: ['system:manage_permissions'],
  revoke_role: ['system:manage_permissions'],
  grant_permission_to_agent: ['system:manage_permissions'],
  revoke_permission_from_agent: ['system:manage_permissions'],

  web_search: ['system:web_search'],
  fetch_url: ['system:fetch_url'],
  http_request: ['system:http_request'],

  create_cron: ['system:manage_crons'],
  delete_cron: ['system:manage_crons'],
  update_cron: ['system:manage_crons'],
  run_cron_now: ['system:manage_crons'],
};

export function filterToolsForAgent(agentId: string): Tool[] {
  const agent = getStore().agents.find(a => a.id === agentId);
  if (!agent) return companyTools;

  const effectivePerms = getEffectivePermissions(agentId);
  const permSet = new Set(effectivePerms.map(p => p.type));

  return companyTools.filter(tool => {
    const required = TOOL_PERMISSION_MAP[tool.function.name];
    if (!required || required.length === 0) return true;
    return required.some(p => permSet.has(p));
  });
}
