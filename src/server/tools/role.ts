import { mutateStore, getStore, getRolesByWorkspace, getEffectivePermissions } from '../store';
import { Role, PermissionEntry, PermissionType } from '../../types';
import { findAgent, logAction } from './agent';

async function requirePermission(executingAgentId: string, perm: PermissionType): Promise<{ success: false; error: string } | null> {
  const { hasPermission } = await import('../store');
  if (!hasPermission(executingAgentId, perm)) {
    return { success: false, error: `You do not have ${perm} permission.` };
  }
  return null;
}

export async function handleCreateRole(args: any, executingAgentId: string): Promise<any> {
  const state = getStore();
  const executingAgent = state.agents.find(a => a.id === executingAgentId);
  if (!executingAgent?.workspaceId) {
    return { success: false, error: 'You are not assigned to a workspace.' };
  }

  const permError = await requirePermission(executingAgentId, 'system:manage_roles');
  if (permError) return permError;

  const workspaceId = executingAgent.workspaceId;
  const existing = state.roles.find(r => r.workspaceId === workspaceId && r.name.toLowerCase() === args.name.toLowerCase());
  if (existing) return { success: false, error: `Role "${args.name}" already exists in this workspace.` };

  const now = new Date().toISOString();
  const newRole: Role = {
    id: crypto.randomUUID(),
    workspaceId,
    name: args.name,
    description: args.description || '',
    permissions: [],
    createdAt: now,
    updatedAt: now,
  };

  mutateStore(s => {
    s.roles.push(newRole);
  });

  logAction('Role Created', `Created role "${args.name}".`, 'success', executingAgentId, 'tool', 'role', workspaceId, { roleId: newRole.id, roleName: args.name });
  return { success: true, message: `Role "${args.name}" created.`, role: newRole };
}

export async function handleDeleteRole(args: any, executingAgentId: string): Promise<any> {
  const state = getStore();
  const executingAgent = state.agents.find(a => a.id === executingAgentId);

  const permError = await requirePermission(executingAgentId, 'system:manage_roles');
  if (permError) return permError;

  const role = state.roles.find(r => r.name.toLowerCase() === args.roleName.toLowerCase() && r.workspaceId === executingAgent?.workspaceId);
  if (!role) return { success: false, error: `Role "${args.roleName}" not found.` };

  mutateStore(s => {
    s.roles = s.roles.filter(r => r.id !== role.id);
    for (const agent of s.agents) {
      if (agent.roleIds) {
        agent.roleIds = agent.roleIds.filter(rid => rid !== role.id);
      }
    }
  });

  logAction('Role Deleted', `Deleted role "${args.roleName}".`, 'warning', executingAgentId, 'tool', 'role', executingAgent?.workspaceId, { roleName: args.roleName });
  return { success: true, message: `Role "${args.roleName}" deleted and revoked from all agents.` };
}

export async function handleUpdateRole(args: any, executingAgentId: string): Promise<any> {
  const state = getStore();
  const executingAgent = state.agents.find(a => a.id === executingAgentId);

  const permError = await requirePermission(executingAgentId, 'system:manage_roles');
  if (permError) return permError;

  const role = state.roles.find(r => r.name.toLowerCase() === args.roleName.toLowerCase() && r.workspaceId === executingAgent?.workspaceId);
  if (!role) return { success: false, error: `Role "${args.roleName}" not found.` };

  const permissions: PermissionEntry[] = Array.isArray(args.permissions) ? args.permissions : [];

  mutateStore(s => {
    const r = s.roles.find(x => x.id === role.id);
    if (r) {
      r.permissions = permissions;
      if (args.description !== undefined) r.description = args.description;
      r.updatedAt = new Date().toISOString();
    }
  });

  logAction('Role Updated', `Updated role "${args.roleName}".`, 'success', executingAgentId, 'tool', 'role', executingAgent?.workspaceId, { roleName: args.roleName });
  return { success: true, message: `Role "${args.roleName}" updated with ${permissions.length} permission(s).` };
}

export async function handleGrantPermissionToRole(args: any, executingAgentId: string): Promise<any> {
  const state = getStore();
  const executingAgent = state.agents.find(a => a.id === executingAgentId);

  const permError = await requirePermission(executingAgentId, 'system:manage_roles');
  if (permError) return permError;

  const role = state.roles.find(r => r.name.toLowerCase() === args.roleName.toLowerCase() && r.workspaceId === executingAgent?.workspaceId);
  if (!role) return { success: false, error: `Role "${args.roleName}" not found.` };

  const validTypes: PermissionType[] = ['file:read', 'file:write', 'file:delete', 'file:list', 'system:run_commands', 'system:approve_commands', 'system:approve_work', 'system:manage_agents', 'system:manage_permissions', 'system:manage_roles', 'system:manage_crons', 'system:broadcast'];
  if (!validTypes.includes(args.permissionType)) {
    return { success: false, error: `Invalid permission type "${args.permissionType}". Valid: ${validTypes.join(', ')}` };
  }

  const scope: 'all' | string[] = args.scope && Array.isArray(args.scope) ? args.scope : 'all';
  const entry: PermissionEntry = { type: args.permissionType, scope };

  mutateStore(s => {
    const r = s.roles.find(x => x.id === role.id);
    if (r) {
      const existingEntry = r.permissions.find(p => p.type === args.permissionType);
      if (existingEntry) {
        if (Array.isArray(existingEntry.scope) && Array.isArray(scope)) {
          for (const s of scope) {
            if (!existingEntry.scope.includes(s)) existingEntry.scope.push(s);
          }
        } else {
          existingEntry.scope = scope;
        }
      } else {
        r.permissions.push(entry);
      }
      r.updatedAt = new Date().toISOString();
    }
  });

  logAction('Role Permission Granted', `Granted ${args.permissionType} to role "${args.roleName}".`, 'success', executingAgentId, 'tool', 'role', executingAgent?.workspaceId, { roleName: args.roleName, permission: args.permissionType });
  return { success: true, message: `Permission "${args.permissionType}" added to role "${args.roleName}".` };
}

export async function handleRevokePermissionFromRole(args: any, executingAgentId: string): Promise<any> {
  const state = getStore();
  const executingAgent = state.agents.find(a => a.id === executingAgentId);

  const permError = await requirePermission(executingAgentId, 'system:manage_roles');
  if (permError) return permError;

  const role = state.roles.find(r => r.name.toLowerCase() === args.roleName.toLowerCase() && r.workspaceId === executingAgent?.workspaceId);
  if (!role) return { success: false, error: `Role "${args.roleName}" not found.` };

  let removed = false;
  mutateStore(s => {
    const r = s.roles.find(x => x.id === role.id);
    if (r) {
      const before = r.permissions.length;
      r.permissions = r.permissions.filter(p => p.type !== args.permissionType);
      removed = r.permissions.length < before;
      r.updatedAt = new Date().toISOString();
    }
  });

  if (!removed) return { success: false, error: `Role "${args.roleName}" does not have permission "${args.permissionType}".` };

  logAction('Role Permission Revoked', `Revoked ${args.permissionType} from role "${args.roleName}".`, 'warning', executingAgentId, 'tool', 'role', executingAgent?.workspaceId, { roleName: args.roleName, permission: args.permissionType });
  return { success: true, message: `Permission "${args.permissionType}" removed from role "${args.roleName}".` };
}

export async function handleListRoles(args: any, executingAgentId: string): Promise<any> {
  const state = getStore();
  const executingAgent = state.agents.find(a => a.id === executingAgentId);
  const wsRoles = getRolesByWorkspace(executingAgent?.workspaceId || '');
  return {
    success: true,
    count: wsRoles.length,
    roles: wsRoles.map(r => ({
      name: r.name,
      description: r.description,
      permissions: r.permissions,
      createdAt: r.createdAt,
    })),
  };
}

export async function handleGetRole(args: any, executingAgentId: string): Promise<any> {
  const state = getStore();
  const executingAgent = state.agents.find(a => a.id === executingAgentId);
  const role = state.roles.find(r => r.name.toLowerCase() === args.roleName.toLowerCase() && r.workspaceId === executingAgent?.workspaceId);
  if (!role) return { success: false, error: `Role "${args.roleName}" not found.` };

  const agentsWithRole = state.agents.filter(a => a.roleIds?.includes(role.id));

  return {
    success: true,
    role: {
      name: role.name,
      description: role.description,
      permissions: role.permissions,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    },
    assignedTo: agentsWithRole.map(a => ({ name: a.name, role: a.role })),
  };
}

export async function handleAssignRole(args: any, executingAgentId: string): Promise<any> {
  const state = getStore();
  const executingAgent = state.agents.find(a => a.id === executingAgentId);

  const permError = await requirePermission(executingAgentId, 'system:manage_permissions');
  if (permError) return permError;

  const agent = findAgent(args.agentName);
  if (!agent) return { success: false, error: `Agent "${args.agentName}" not found.` };

  const role = state.roles.find(r => r.name.toLowerCase() === args.roleName.toLowerCase() && r.workspaceId === executingAgent?.workspaceId);
  if (!role) return { success: false, error: `Role "${args.roleName}" not found in your workspace.` };

  mutateStore(s => {
    const a = s.agents.find(x => x.id === agent.id);
    if (a) {
      if (!a.roleIds) a.roleIds = [];
      if (!a.roleIds.includes(role.id)) {
        a.roleIds.push(role.id);
      }
    }
  });

  logAction('Role Assigned', `Assigned role "${args.roleName}" to ${agent.name}.`, 'success', executingAgentId, 'tool', 'role', executingAgent?.workspaceId, { roleName: args.roleName, targetAgentId: agent.id, targetAgentName: agent.name });
  return { success: true, message: `Role "${args.roleName}" assigned to ${agent.name}.` };
}

export async function handleRevokeRole(args: any, executingAgentId: string): Promise<any> {
  const state = getStore();
  const executingAgent = state.agents.find(a => a.id === executingAgentId);

  const permError = await requirePermission(executingAgentId, 'system:manage_permissions');
  if (permError) return permError;

  const agent = findAgent(args.agentName);
  if (!agent) return { success: false, error: `Agent "${args.agentName}" not found.` };

  const role = state.roles.find(r => r.name.toLowerCase() === args.roleName.toLowerCase() && r.workspaceId === executingAgent?.workspaceId);
  if (!role) return { success: false, error: `Role "${args.roleName}" not found in your workspace.` };

  mutateStore(s => {
    const a = s.agents.find(x => x.id === agent.id);
    if (a && a.roleIds) {
      a.roleIds = a.roleIds.filter(rid => rid !== role.id);
    }
  });

  logAction('Role Revoked', `Revoked role "${args.roleName}" from ${agent.name}.`, 'warning', executingAgentId, 'tool', 'role', executingAgent?.workspaceId, { roleName: args.roleName, targetAgentId: agent.id, targetAgentName: agent.name });
  return { success: true, message: `Role "${args.roleName}" revoked from ${agent.name}.` };
}

export async function handleGetAgentPermissions(args: any, executingAgentId: string): Promise<any> {
  const state = getStore();
  const agent = findAgent(args.agentName);
  if (!agent) return { success: false, error: `Agent "${args.agentName}" not found.` };

  const perms = getEffectivePermissions(agent.id);
  const roleIds = agent.roleIds || [];
  const roles = state.roles.filter(r => roleIds.includes(r.id));

  return {
    success: true,
    agent: agent.name,
    roles: roles.map(r => ({ name: r.name, permissions: r.permissions })),
    directPermissions: agent.permissions || [],
    effectivePermissions: perms,
  };
}

export async function handleListPermissions(args: any, executingAgentId: string): Promise<any> {
  return {
    success: true,
    permissionTypes: [
      { type: 'file:read', description: 'Read files in workspace', scopeable: true },
      { type: 'file:write', description: 'Create/modify files in workspace', scopeable: true },
      { type: 'file:delete', description: 'Delete files in workspace', scopeable: true },
      { type: 'file:list', description: 'List directory contents', scopeable: true },
      { type: 'system:run_commands', description: 'Run shell commands in the workspace Docker sandbox', scopeable: false },
      { type: 'system:approve_commands', description: 'Approve pending command runs', scopeable: false },
      { type: 'system:approve_work', description: 'Approve or reject pending task/pipeline approvals', scopeable: false },
      { type: 'system:manage_agents', description: 'Create/update/delete agents', scopeable: false },
      { type: 'system:manage_permissions', description: 'Assign/revoke roles to agents', scopeable: false },
      { type: 'system:manage_roles', description: 'Create/update/delete roles', scopeable: false },
      { type: 'system:manage_crons', description: 'Create/update/delete/run cron jobs', scopeable: false },
      { type: 'system:broadcast', description: 'Send broadcasts to all connected agents', scopeable: false },
      { type: 'system:web_search', description: 'Search the internet for current information', scopeable: false },
      { type: 'system:fetch_url', description: 'Fetch and read content from a URL', scopeable: false },
    ]
  };
}

export async function handleGrantPermissionToAgent(args: any, executingAgentId: string): Promise<any> {
  const state = getStore();
  const executingAgent = state.agents.find(a => a.id === executingAgentId);

  const permError = await requirePermission(executingAgentId, 'system:manage_permissions');
  if (permError) return permError;

  const agent = findAgent(args.agentName);
  if (!agent) return { success: false, error: `Agent "${args.agentName}" not found.` };

  const validTypes: PermissionType[] = [
    'file:read', 'file:write', 'file:delete', 'file:list',
    'system:run_commands', 'system:approve_commands', 'system:approve_work',
    'system:manage_agents', 'system:manage_permissions', 'system:manage_roles',
    'system:manage_crons', 'system:broadcast', 'system:web_search', 'system:fetch_url',
  ];
  if (!validTypes.includes(args.permissionType)) {
    return { success: false, error: `Invalid permission type: ${args.permissionType}. Valid: ${validTypes.join(', ')}` };
  }

  mutateStore(s => {
    const a = s.agents.find(x => x.id === agent.id);
    if (a) {
      if (!a.permissions) a.permissions = [];
      const existing = a.permissions.findIndex(p => p.type === args.permissionType);
      const entry: PermissionEntry = {
        type: args.permissionType,
        scope: Array.isArray(args.scope) ? args.scope : 'all',
      };
      if (existing !== -1) {
        a.permissions[existing] = entry;
      } else {
        a.permissions.push(entry);
      }
    }
  });

  logAction('Permission Granted', `Granted "${args.permissionType}" to ${agent.name}.`, 'success', executingAgentId, 'tool', 'role', executingAgent?.workspaceId, { permission: args.permissionType, targetAgentName: agent.name });
  return { success: true, message: `Permission "${args.permissionType}" granted to ${agent.name}.` };
}

export async function handleRevokePermissionFromAgent(args: any, executingAgentId: string): Promise<any> {
  const state = getStore();

  const permError = await requirePermission(executingAgentId, 'system:manage_permissions');
  if (permError) return permError;

  const agent = findAgent(args.agentName);
  if (!agent) return { success: false, error: `Agent "${args.agentName}" not found.` };

  mutateStore(s => {
    const a = s.agents.find(x => x.id === agent.id);
    if (a && a.permissions) {
      a.permissions = a.permissions.filter(p => p.type !== args.permissionType);
    }
  });

  logAction('Permission Revoked', `Revoked "${args.permissionType}" from ${agent.name}.`, 'warning', executingAgentId, 'tool', 'role', state.agents.find(a => a.id === executingAgentId)?.workspaceId, { permission: args.permissionType, targetAgentName: agent.name });
  return { success: true, message: `Permission "${args.permissionType}" revoked from ${agent.name}.` };
}
