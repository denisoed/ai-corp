import React, { useState } from 'react';
import { useStore } from '../../store';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Badge } from '../ui/Badge';
import { CustomSelect, SelectItem } from '../ui/CustomSelect';
import { Plus, Trash2, Shield, ShieldCheck, ShieldOff, Check, ChevronDown, HelpCircle, Users, AlertTriangle, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { PermissionType, Role, PermissionEntry } from '../../types';

const ALL_PERMISSION_TYPES: { type: PermissionType; label: string; icon: string; desc: string }[] = [
  { type: 'file:read',              label: 'Read files',        icon: '👁',   desc: 'Can read file contents in the workspace directory (respecting scope).' },
  { type: 'file:write',             label: 'Write files',       icon: '✏️',   desc: 'Can create and modify files in the workspace directory (respecting scope).' },
  { type: 'file:delete',            label: 'Delete files',      icon: '🗑',   desc: 'Can delete files in the workspace directory (respecting scope).' },
  { type: 'file:list',              label: 'List directories',  icon: '📂',   desc: 'Can browse the workspace directory structure and list files.' },
  { type: 'system:manage_agents',   label: 'Manage agents',     icon: '🤖',   desc: 'Can create, update, and delete agents in the workspace.' },
  { type: 'system:manage_permissions', label: 'Manage permissions', icon: '🔑', desc: 'Can assign and revoke roles to/from agents.' },
  { type: 'system:manage_roles',    label: 'Manage roles',      icon: '🛡',   desc: 'Can create, update, and delete roles.' },
  { type: 'system:manage_crons',    label: 'Manage crons',      icon: '⏰',   desc: 'Can create, update, delete, and manually run cron jobs.' },
  { type: 'system:broadcast',       label: 'Broadcast messages', icon: '📢',  desc: 'Can send broadcasts to all Telegram-connected agents.' },
  { type: 'system:web_search',      label: 'Web search',        icon: '🔍',   desc: 'Can search the internet for current information, news, and data.' },
  { type: 'system:fetch_url',       label: 'Fetch URLs',        icon: '🌐',   desc: 'Can fetch and read content from web pages.' },
];

const PERM_COLORS: Record<string, string> = {
  'file:read':    'bg-blue-500/15 text-blue-300 border-blue-500/20',
  'file:write':   'bg-emerald-500/15 text-emerald-300 border-emerald-500/20',
  'file:delete':  'bg-red-500/15 text-red-300 border-red-500/20',
  'file:list':    'bg-cyan-500/15 text-cyan-300 border-cyan-500/20',
  'system:manage_agents':   'bg-purple-500/15 text-purple-300 border-purple-500/20',
  'system:manage_permissions': 'bg-amber-500/15 text-amber-300 border-amber-500/20',
  'system:manage_roles':    'bg-indigo-500/15 text-indigo-300 border-indigo-500/20',
  'system:manage_crons':    'bg-pink-500/15 text-pink-300 border-pink-500/20',
  'system:broadcast':       'bg-orange-500/15 text-orange-300 border-orange-500/20',
  'system:web_search':      'bg-green-500/15 text-green-300 border-green-500/20',
  'system:fetch_url':       'bg-teal-500/15 text-teal-300 border-teal-500/20',
};

function PermissionCheckboxGrid({
  selected,
  onChange,
}: {
  selected: Set<PermissionType>;
  onChange: (next: Set<PermissionType>) => void;
}) {
  const toggle = (t: PermissionType) => {
    const next = new Set(selected);
    if (next.has(t)) next.delete(t); else next.add(t);
    onChange(next);
  };

  return (
    <div className="space-y-1">
      {ALL_PERMISSION_TYPES.map(pt => {
        const isChecked = selected.has(pt.type);
        return (
          <button
            key={pt.type}
            type="button"
            onClick={() => toggle(pt.type)}
            className={cn(
              "w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs transition-colors text-left",
              isChecked ? "bg-indigo-500/10 text-zinc-200" : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300"
            )}
          >
            <div className={cn(
              "w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors",
              isChecked ? "bg-indigo-500 border-indigo-500" : "border-zinc-600"
            )}>
              {isChecked && <Check size={11} className="text-white" />}
            </div>
            <span>{pt.icon}</span>
            <span>{pt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="absolute inset-0" onClick={onCancel} />
      <div className="relative w-full max-w-sm bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0">
            <AlertTriangle size={16} className="text-red-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>
            <p className="text-xs text-zinc-500 mt-1">{message}</p>
          </div>
        </div>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
          <Button size="sm" className="bg-red-600 hover:bg-red-500 text-white" onClick={onConfirm}>
            {confirmLabel || 'Delete'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function RolesManagement() {
  const { roles, agents, workspaces, createRole, deleteRole, updateRole, assignRole, revokeRole, grantPermissionToAgent, revokePermissionFromAgent, addLog } = useStore();
  const [showCreate, setShowCreate] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNameValue, setEditNameValue] = useState('');
  const [editDescValue, setEditDescValue] = useState('');
  const [agentWsFilter, setAgentWsFilter] = useState('');
  const [permEditOpen, setPermEditOpen] = useState<string | null>(null);
  const [permEditSet, setPermEditSet] = useState<Set<PermissionType>>(new Set());

  // Confirm dialog state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<(() => void) | null>(null);
  const [confirmTitle, setConfirmTitle] = useState('');
  const [confirmMsg, setConfirmMsg] = useState('');
  const [confirmLabel, setConfirmLabel] = useState('Delete');

  // Create modal state
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newWs, setNewWs] = useState('');
  const [newPerms, setNewPerms] = useState<Set<PermissionType>>(new Set());

  // Group roles by workspace
  const rolesByWs = new Map<string, Role[]>();
  for (const role of roles) {
    const wsRoles = rolesByWs.get(role.workspaceId) || [];
    wsRoles.push(role);
    rolesByWs.set(role.workspaceId, wsRoles);
  }
  for (const ws of workspaces) {
    if (!rolesByWs.has(ws.id)) rolesByWs.set(ws.id, []);
  }

  const askConfirm = (title: string, msg: string, action: () => void, label?: string) => {
    setConfirmTitle(title);
    setConfirmMsg(msg);
    setConfirmAction(() => action);
    setConfirmLabel(label || 'Delete');
    setConfirmOpen(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newWs) return;
    const createdRole = await createRole({ name: newName.trim(), description: newDesc || undefined, workspaceId: newWs });
    if (newPerms.size > 0 && createdRole) {
      const perms: PermissionEntry[] = [];
      for (const t of newPerms) {
        perms.push({ type: t, scope: 'all' });
      }
      await updateRole(createdRole.id, { permissions: perms });
      addLog({ agentId: 'system', action: 'Role Created', details: `Created role "${newName}" with ${perms.length} permissions`, type: 'success' });
    } else {
      addLog({ agentId: 'system', action: 'Role Created', details: `Created role "${newName}"`, type: 'success' });
    }
    setNewName(''); setNewDesc(''); setNewWs(''); setNewPerms(new Set());
    setShowCreate(false);
  };

  const handleDeleteRole = async (roleId: string) => {
    const role = roles.find(r => r.id === roleId);
    if (!role) return;
    askConfirm(
      `Delete role "${role.name}"?`,
      `This will permanently remove the role and revoke it from ${agents.filter(a => a.roleIds?.includes(roleId)).length} agent(s).`,
      async () => {
        await deleteRole(roleId);
        addLog({ agentId: 'system', action: 'Role Deleted', details: `Deleted role "${role.name}"`, type: 'warning' });
        if (editingId === roleId) setEditingId(null);
        setConfirmOpen(false);
      },
      'Delete Role'
    );
  };

  const handleRemovePermission = (role: Role, permType: PermissionType) => {
    const newPermissions = role.permissions.filter(p => p.type !== permType);
    askConfirm(
      `Remove "${ALL_PERMISSION_TYPES.find(pt => pt.type === permType)?.label || permType}"?`,
      `This will revoke this permission from role "${role.name}". ${agents.filter(a => a.roleIds?.includes(role.id)).length} agent(s) will lose this capability.`,
      async () => {
        await updateRole(role.id, { permissions: newPermissions });
        addLog({ agentId: 'system', action: 'Permission Revoked', details: `Revoked ${permType} from role "${role.name}"`, type: 'warning' });
        setConfirmOpen(false);
      },
      'Remove'
    );
  };

  const handlePermissionSave = async (roleId: string, permissions: PermissionEntry[]) => {
    await updateRole(roleId, { permissions });
    setPermEditOpen(null);
  };

  const openPermEdit = (role: Role) => {
    setPermEditOpen(role.id);
    setPermEditSet(new Set(role.permissions.map(p => p.type)));
  };

  const handleEditSave = async (roleId: string) => {
    if (!editNameValue.trim()) return;
    await updateRole(roleId, { name: editNameValue.trim(), description: editDescValue });
    setEditingId(null);
  };

  const handleToggleRole = async (agentId: string, roleId: string) => {
    const agent = agents.find(a => a.id === agentId);
    if (!agent) return;
    if (agent.roleIds?.includes(roleId)) {
      await revokeRole(agentId, roleId);
    } else {
      await assignRole(agentId, roleId);
    }
  };

  const filteredAgents = agentWsFilter
    ? agents.filter(a => a.workspaceId === agentWsFilter)
    : [];
  const filteredRoles = agentWsFilter
    ? rolesByWs.get(agentWsFilter) || []
    : [];

  return (
    <div className="h-full flex flex-col space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 flex-none shrink-0 border-b border-zinc-800 pb-4">
        <div>
          <h2 className="text-xs uppercase font-bold tracking-widest text-zinc-500">Roles & Permissions</h2>
          <p className="text-sm text-zinc-400 mt-1">Create roles, define permissions, and assign them to agents.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => setShowHelp(true)} title="Permission Reference">
            <HelpCircle className="mr-1.5 h-4 w-4" />
            Help
          </Button>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create Role
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 overflow-hidden">
        {/* LEFT: Roles per workspace */}
        <div className="space-y-4 overflow-y-auto pr-1">
          <h3 className="text-sm font-semibold text-zinc-300 flex items-center gap-2 sticky top-0 bg-zinc-950 py-2 z-10">
            <Shield size={16} className="text-indigo-400" />
            Roles
            <Badge className="ml-1">{roles.length}</Badge>
          </h3>

          {workspaces.length === 0 && (
            <div className="text-center py-12 text-zinc-500 text-sm border-2 border-dashed border-zinc-800 rounded-xl">
              No workspaces yet. Create a workspace first.
            </div>
          )}

          {Array.from(rolesByWs.entries()).map(([wsId, wsRoles]) => {
            const ws = workspaces.find(w => w.id === wsId);
            if (!ws) return null;

            return (
              <div key={wsId} className="space-y-2">
                <div
                  className="text-xs font-bold text-zinc-500 uppercase tracking-wider pl-2"
                  style={{ borderLeft: `3px solid ${ws.color || '#6366f1'}` }}
                >
                  {ws.name}
                  <span className="text-zinc-600 font-normal normal-case tracking-normal ml-1">({wsRoles.length} roles)</span>
                </div>

                {wsRoles.length === 0 && (
                  <div className="ml-3 text-xs text-zinc-600 italic py-2">
                    No roles in this workspace.{' '}
                    <button onClick={() => { setNewWs(wsId); setShowCreate(true); }} className="text-indigo-400 hover:text-indigo-300 underline">Create one</button>.
                  </div>
                )}

                {wsRoles.map(role => {
                  const assignedCount = agents.filter(a => a.roleIds?.includes(role.id)).length;
                  const isEditingPerms = permEditOpen === role.id;

                  return (
                    <div key={role.id} className="ml-2 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl transition-all">
                      <div className="p-3">
                        {editingId === role.id ? (
                          <div className="space-y-2">
                            <Input
                              value={editNameValue}
                              onChange={e => setEditNameValue(e.target.value)}
                              className="bg-zinc-950 text-sm h-7 py-0"
                              placeholder="Role name"
                              autoFocus
                              onKeyDown={e => { if (e.key === 'Escape') setEditingId(null); }}
                            />
                            <Input
                              value={editDescValue}
                              onChange={e => setEditDescValue(e.target.value)}
                              className="bg-zinc-950 text-xs h-7 py-0"
                              placeholder="Description"
                            />
                            <div className="flex gap-2">
                              <Button size="sm" className="text-xs h-7" onClick={() => handleEditSave(role.id)}>Save</Button>
                              <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => setEditingId(null)}>Cancel</Button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <span className="text-sm font-semibold text-zinc-200">{role.name}</span>
                                {role.description && (
                                  <p className="text-xs text-zinc-500 mt-0.5">{role.description}</p>
                                )}
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  onClick={() => { setEditingId(role.id); setEditNameValue(role.name); setEditDescValue(role.description || ''); }}
                                  className="text-zinc-600 hover:text-zinc-400 p-0.5"
                                  title="Edit"
                                >
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                                  </svg>
                                </button>
                                <button
                                  onClick={() => handleDeleteRole(role.id)}
                                  className="text-zinc-600 hover:text-red-400 p-0.5"
                                  title="Delete"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </div>

                            {/* Permission badges with X button */}
                            <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
                              {role.permissions.map(p => (
                                <span
                                  key={p.type}
                                  className={cn(
                                    "group flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium border",
                                    PERM_COLORS[p.type] || 'text-zinc-400 border-zinc-700 bg-zinc-800'
                                  )}
                                >
                                  {ALL_PERMISSION_TYPES.find(pt => pt.type === p.type)?.label || p.type}
                                  {Array.isArray(p.scope) && <span className="text-zinc-500">({p.scope.join(',')})</span>}
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleRemovePermission(role, p.type); }}
                                    className="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-red-400 transition-all ml-0.5"
                                  >
                                    <X size={9} />
                                  </button>
                                </span>
                              ))}
                              {role.permissions.length === 0 && (
                                <span className="text-[10px] text-zinc-600 italic">No permissions</span>
                              )}
                              {assignedCount > 0 && (
                                <span className="text-[10px] text-zinc-600 ml-auto">{assignedCount} agent{assignedCount !== 1 ? 's' : ''}</span>
                              )}
                            </div>

                            {/* Permission edit toggle */}
                            <div className="mt-2.5">
                              <button
                                type="button"
                                onClick={() => isEditingPerms ? setPermEditOpen(null) : openPermEdit(role)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 hover:bg-indigo-500/20 transition-colors"
                              >
                                <Shield size={13} />
                                {isEditingPerms ? 'Close' : `Edit Permissions (${role.permissions.length})`}
                                <ChevronDown size={12} className={cn("transition-transform", isEditingPerms && "rotate-180")} />
                              </button>

                              {isEditingPerms && (
                                <div className="mt-2 p-3 bg-zinc-950 border border-zinc-800 rounded-lg">
                                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-2">Select Permissions</span>
                                  <PermissionCheckboxGrid
                                    selected={permEditSet}
                                    onChange={setPermEditSet}
                                  />
                                  <div className="flex gap-2 mt-3 pt-2 border-t border-zinc-800">
                                    <Button
                                      size="sm"
                                      className="text-xs h-7 flex-1"
                                      onClick={() => {
                                        const perms: PermissionEntry[] = [];
                                        for (const t of permEditSet) {
                                          const existing = role.permissions.find(p => p.type === t);
                                          perms.push(existing || { type: t, scope: 'all' });
                                        }
                                        handlePermissionSave(role.id, perms);
                                      }}
                                    >
                                      Apply Changes
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="text-xs h-7"
                                      onClick={() => setPermEditOpen(null)}
                                    >
                                      Cancel
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* RIGHT: Agent role assignment */}
        <div className="space-y-4 overflow-y-auto pr-1">
          <h3 className="text-sm font-semibold text-zinc-300 flex items-center gap-2 sticky top-0 bg-zinc-950 py-2 z-10">
            <Users size={16} className="text-purple-400" />
            Agent Permissions
          </h3>

          <div className="relative" style={{ zIndex: 20 }}>
            <CustomSelect
              value={agentWsFilter || '__select__'}
              onValueChange={(v) => setAgentWsFilter(v === '__select__' ? '' : v)}
              placeholder="Select a workspace..."
              className="w-full"
            >
              <SelectItem value="__select__" disabled className="text-zinc-500">Select a workspace...</SelectItem>
              {workspaces.map(w => (
                <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
              ))}
            </CustomSelect>
          </div>

          {!agentWsFilter && (
            <div className="text-center py-12 text-zinc-500 text-sm border-2 border-dashed border-zinc-800 rounded-xl">
              Select a workspace to manage agent role assignments.
            </div>
          )}

          {agentWsFilter && filteredAgents.length === 0 && (
            <div className="text-center py-12 text-zinc-500 text-sm border-2 border-dashed border-zinc-800 rounded-xl">
              No agents in this workspace.
            </div>
          )}

          {agentWsFilter && filteredAgents.map(agent => {
            const agentRoleIds = agent.roleIds || [];
            const agentRoles = filteredRoles.filter(r => agentRoleIds.includes(r.id));
            const allPerms = agentRoles.flatMap(r => r.permissions);
            const uniquePerms = new Map<string, PermissionEntry>();
            for (const p of allPerms) uniquePerms.set(p.type, p);

            return (
              <div key={agent.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 bg-zinc-800 text-zinc-300 rounded-lg flex items-center justify-center font-bold text-[10px]">
                    {agent.name.substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <span className="text-sm font-medium text-zinc-200">{agent.name}</span>
                    {agent.role && <span className="text-[10px] text-zinc-500 ml-1.5">({agent.role})</span>}
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5 items-center">
                  {filteredRoles.length === 0 && <span className="text-[10px] text-zinc-600">No roles in workspace.</span>}
                  {filteredRoles.map(role => {
                    const hasRole = agentRoleIds.includes(role.id);
                    return (
                      <button
                        key={role.id}
                        onClick={() => handleToggleRole(agent.id, role.id)}
                        className={cn(
                          "px-2.5 py-1 rounded-md text-[11px] font-medium border transition-all",
                          hasRole
                            ? "bg-indigo-500/15 text-indigo-300 border-indigo-500/30 hover:bg-red-500/10 hover:text-red-300 hover:border-red-500/20"
                            : "bg-zinc-800 text-zinc-500 border-zinc-700 hover:bg-zinc-700 hover:text-zinc-300"
                        )}
                      >
                        {hasRole ? <ShieldCheck size={10} className="inline mr-1" /> : <ShieldOff size={10} className="inline mr-1" />}
                        {role.name}
                      </button>
                    );
                  })}
                </div>

                {uniquePerms.size > 0 && (
                  <div className="pt-1 border-t border-zinc-800/50">
                    <span className="text-[10px] text-zinc-500 mb-1.5 block">Effective permissions:</span>
                    <div className="flex flex-wrap gap-1">
                      {Array.from(uniquePerms.values()).map(p => (
                        <span key={p.type} className={cn("px-1.5 py-0.5 rounded text-[9px] border", PERM_COLORS[p.type] || 'text-zinc-400 border-zinc-700 bg-zinc-800')}>
                          {ALL_PERMISSION_TYPES.find(pt => pt.type === p.type)?.label || p.type}
                          {Array.isArray(p.scope) && <span className="text-zinc-500"> ({p.scope.join(',')})</span>}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {agentRoles.length === 0 && <p className="text-[10px] text-zinc-600 italic">Default "reader" access only.</p>}

                <div className="pt-1 border-t border-zinc-800/50">
                  <span className="text-[10px] text-zinc-500 mb-1.5 block">Extra permissions (direct):</span>
                  <div className="flex flex-wrap gap-1">
                    {(['file:read', 'file:write', 'file:delete', 'file:list', 'system:web_search', 'system:fetch_url', 'system:manage_agents', 'system:manage_crons', 'system:broadcast'] as PermissionType[])
                      .filter(pt => !uniquePerms.has(pt) || (agent.permissions || []).some(p => p.type === pt))
                      .map(pt => {
                      const hasDirect = (agent.permissions || []).some(p => p.type === pt);
                      return (
                        <button
                          key={pt}
                          onClick={async () => {
                            if (hasDirect) {
                              await revokePermissionFromAgent(agent.id, pt);
                            } else {
                              await grantPermissionToAgent(agent.id, pt);
                            }
                          }}
                          className={cn(
                            "px-1.5 py-0.5 rounded text-[9px] border transition-all",
                            hasDirect
                              ? "bg-indigo-500/15 text-indigo-300 border-indigo-500/30 hover:bg-red-500/10 hover:text-red-300 hover:border-red-500/20"
                              : "bg-zinc-800 text-zinc-500 border-zinc-700 hover:bg-zinc-700 hover:text-zinc-300"
                          )}
                        >
                          {hasDirect ? <Check size={9} className="inline mr-0.5" /> : <Plus size={9} className="inline mr-0.5 opacity-50" />}
                          {ALL_PERMISSION_TYPES.find(apt => apt.type === pt)?.label || pt}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Create Role Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="absolute inset-0" onClick={() => { setShowCreate(false); setNewPerms(new Set()); }} />
          <div className="relative w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-zinc-800 shrink-0">
              <h3 className="text-lg font-semibold text-zinc-100">Create Role</h3>
              <p className="text-sm text-zinc-500 mt-1">Roles bundle permissions for assignment to agents.</p>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4 overflow-y-auto flex-1">
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1">
                  Workspace <span className="text-red-400">*</span>
                </label>
                {workspaces.length === 0 ? (
                  <p className="text-xs text-amber-400">No workspaces. Create a workspace first in the Workspaces page.</p>
                ) : (
                  <CustomSelect value={newWs} onValueChange={setNewWs} placeholder="Choose workspace...">
                    {workspaces.map(w => (
                      <SelectItem key={w.id} value={w.id}>
                        <span className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: w.color || '#6366f1' }} />
                          {w.name}
                        </span>
                      </SelectItem>
                    ))}
                  </CustomSelect>
                )}
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1">
                  Role Name <span className="text-red-400">*</span>
                </label>
                <Input
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  required
                  placeholder="e.g. Senior Developer"
                  className="bg-zinc-900 border-zinc-800"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Description</label>
                <Input
                  value={newDesc}
                  onChange={e => setNewDesc(e.target.value)}
                  placeholder="What this role is for"
                  className="bg-zinc-900 border-zinc-800"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Permissions</label>
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-2 max-h-64 overflow-y-auto">
                  <PermissionCheckboxGrid selected={newPerms} onChange={setNewPerms} />
                </div>
                <p className="text-[10px] text-zinc-600">{newPerms.size} permission{newPerms.size !== 1 ? 's' : ''} selected</p>
              </div>
            </form>
            <div className="p-6 border-t border-zinc-800 flex justify-end gap-3 shrink-0">
              <Button variant="ghost" type="button" onClick={() => { setShowCreate(false); setNewPerms(new Set()); }}>Cancel</Button>
              <Button type="submit" className="bg-indigo-600 hover:bg-indigo-500" disabled={!newName.trim() || !newWs} onClick={handleCreate}>Create Role</Button>
            </div>
          </div>
        </div>
      )}

      {/* Help Modal */}
      {showHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="absolute inset-0" onClick={() => setShowHelp(false)} />
          <div className="relative w-full max-w-xl bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="p-6 border-b border-zinc-800 sticky top-0 bg-zinc-950 z-10">
              <h3 className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
                <HelpCircle size={18} className="text-indigo-400" />
                Permission Reference
              </h3>
              <p className="text-sm text-zinc-500 mt-1">Each permission type grants specific capabilities to an agent.</p>
            </div>
            <div className="p-6 space-y-3">
              <div className="text-xs text-zinc-500 mb-2">
                <strong className="text-zinc-300">File permissions</strong> control what agents can do with files in the workspace directory.
                <strong className="text-zinc-300 ml-2">System permissions</strong> control administrative capabilities.
              </div>
              {ALL_PERMISSION_TYPES.map(pt => (
                <div
                  key={pt.type}
                  className={cn("p-4 rounded-xl border", PERM_COLORS[pt.type])}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-lg mt-0.5">{pt.icon}</span>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-zinc-100">{pt.label}</span>
                        <code className="text-[10px] text-zinc-500 font-mono bg-zinc-950 px-1.5 py-0.5 rounded">{pt.type}</code>
                      </div>
                      <p className="text-xs text-zinc-400 leading-relaxed">{pt.desc}</p>
                      {pt.type.startsWith('file:') && (
                        <p className="text-[10px] text-zinc-500 mt-1">
                          <strong>Scope:</strong> can be limited by path globs (e.g. "src/**", "docs/*.md"). "all" means full workspace access.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-6 border-t border-zinc-800 flex justify-end bg-zinc-950 sticky bottom-0">
              <Button onClick={() => setShowHelp(false)}>Got it</Button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Dialog */}
      {confirmOpen && (
        <ConfirmDialog
          title={confirmTitle}
          message={confirmMsg}
          confirmLabel={confirmLabel}
          onConfirm={() => confirmAction?.()}
          onCancel={() => setConfirmOpen(false)}
        />
      )}
    </div>
  );
}
