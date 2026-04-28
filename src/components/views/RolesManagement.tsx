import React, { useState } from 'react';
import { useStore } from '../../store';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Badge } from '../ui/Badge';
import { CustomSelect, SelectItem } from '../ui/CustomSelect';
import { Plus, Trash2, Shield, ShieldCheck, ShieldOff, Eye, FileText, Pencil, Edit3, List, Users, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { PermissionType, Role, PermissionEntry, Agent } from '../../types';

const PERMISSION_LABELS: Record<PermissionType, { label: string; icon: React.ReactNode; color: string }> = {
  'file:read':     { label: 'Read Files',       icon: <Eye size={12} />,    color: 'text-blue-400 border-blue-500/30 bg-blue-500/10' },
  'file:write':    { label: 'Write Files',      icon: <Edit3 size={12} />,  color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' },
  'file:delete':   { label: 'Delete Files',     icon: <Trash2 size={12} />, color: 'text-red-400 border-red-500/30 bg-red-500/10' },
  'file:list':     { label: 'List Directory',   icon: <List size={12} />,   color: 'text-cyan-400 border-cyan-500/30 bg-cyan-500/10' },
  'system:manage_agents':      { label: 'Manage Agents',      icon: <Users size={12} />,    color: 'text-purple-400 border-purple-500/30 bg-purple-500/10' },
  'system:manage_permissions': { label: 'Manage Permissions', icon: <ShieldCheck size={12} />, color: 'text-amber-400 border-amber-500/30 bg-amber-500/10' },
  'system:manage_roles':       { label: 'Manage Roles',      icon: <Shield size={12} />,    color: 'text-indigo-400 border-indigo-500/30 bg-indigo-500/10' },
  'system:manage_crons':       { label: 'Manage Crons',      icon: <ClockIcon size={12} />,  color: 'text-pink-400 border-pink-500/30 bg-pink-500/10' },
  'system:broadcast':          { label: 'Broadcast',         icon: <BroadcastIcon size={12} />, color: 'text-orange-400 border-orange-500/30 bg-orange-500/10' },
};

function ClockIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function BroadcastIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18.4 12c.8 3.8 2.6 5 2.6 5H3s1.8-1.2 2.6-5" />
      <path d="M12 6v6l4 2" />
      <circle cx="12" cy="6" r="4" />
      <path d="M12 2v4" />
    </svg>
  );
}

export function RolesManagement() {
  const { roles, agents, workspaces, createRole, deleteRole, updateRole, assignRole, revokeRole, addLog } = useStore();
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterWs, setFilterWs] = useState('');
  const [expandedRole, setExpandedRole] = useState<string | null>(null);

  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newWs, setNewWs] = useState('');

  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [addPermType, setAddPermType] = useState<string>('');
  const [addPermScope, setAddPermScope] = useState('');

  const filtered = filterWs
    ? roles.filter(r => r.workspaceId === filterWs)
    : roles;

  const workspaceRoles = filterWs ? filtered : [];

  const workspaceAgents = filterWs
    ? agents.filter(a => a.workspaceId === filterWs)
    : [];

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || !newWs) return;
    await createRole({ name: newName, description: newDesc || undefined, workspaceId: newWs });
    addLog({ agentId: 'system', action: 'Role Created', details: `Created role "${newName}"`, type: 'success' });
    setNewName(''); setNewDesc(''); setNewWs('');
    setShowCreate(false);
  };

  const handleDelete = async (roleId: string) => {
    const role = roles.find(r => r.id === roleId);
    await deleteRole(roleId);
    if (role) addLog({ agentId: 'system', action: 'Role Deleted', details: `Deleted role "${role.name}"`, type: 'warning' });
  };

  const handleAddPermission = async (roleId: string) => {
    if (!addPermType) return;
    const role = roles.find(r => r.id === roleId);
    if (!role) return;

    const scope = addPermScope
      ? addPermScope.split(',').map(s => s.trim()).filter(Boolean)
      : undefined;

    const existing = role.permissions.find(p => p.type === addPermType);
    let newPermissions: PermissionEntry[];

    if (existing && Array.isArray(existing.scope) && scope) {
      newPermissions = role.permissions.map(p =>
        p.type === addPermType
          ? { ...p, scope: [...(Array.isArray(p.scope) ? p.scope : []), ...scope] }
          : p
      );
    } else if (existing) {
      newPermissions = role.permissions.map(p =>
        p.type === addPermType
          ? { type: addPermType as PermissionType, scope: scope || 'all' }
          : p
      );
    } else {
      newPermissions = [...role.permissions, { type: addPermType as PermissionType, scope: scope || 'all' }];
    }

    await updateRole(roleId, { permissions: newPermissions });
    setAddPermType('');
    setAddPermScope('');
  };

  const handleRemovePermission = async (roleId: string, permType: PermissionType) => {
    const role = roles.find(r => r.id === roleId);
    if (!role) return;
    const newPermissions = role.permissions.filter(p => p.type !== permType);
    await updateRole(roleId, { permissions: newPermissions });
  };

  const handleToggleRole = async (agent: Agent, roleId: string) => {
    if (agent.roleIds?.includes(roleId)) {
      await revokeRole(agent.id, roleId);
    } else {
      await assignRole(agent.id, roleId);
    }
  };

  return (
    <div className="h-full flex flex-col space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 flex-none shrink-0 border-b border-zinc-800 pb-4">
        <div>
          <h2 className="text-xs uppercase font-bold tracking-widest text-zinc-500">Roles & Permissions</h2>
          <p className="text-sm text-zinc-400 mt-1">Create roles, define permissions, and assign them to agents.</p>
        </div>
        <div className="flex gap-2">
          <CustomSelect value={filterWs || '__all__'} onValueChange={(v) => setFilterWs(v === '__all__' ? '' : v)} placeholder="All Workspaces" className="w-48">
            <SelectItem value="__all__">All Workspaces</SelectItem>
            {workspaces.map(w => (
              <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
            ))}
          </CustomSelect>
          <Button onClick={() => setShowCreate(true)} disabled={!filterWs}>
            <Plus className="mr-2 h-4 w-4" />
            Create Role
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 overflow-hidden">
        {/* Roles List */}
        <div className="space-y-3 overflow-y-auto pr-1">
          <h3 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
            <Shield size={16} className="text-indigo-400" />
            {filterWs ? 'Workspace Roles' : 'All Roles'}
            <Badge className="ml-1">{filtered.length}</Badge>
          </h3>

          {filtered.length === 0 && (
            <div className="text-center py-12 text-zinc-500 text-sm border-2 border-dashed border-zinc-800 rounded-xl">
              {filterWs ? 'No roles in this workspace yet. Create one to get started.' : 'Select a workspace to manage its roles.'}
            </div>
          )}

          {filtered.map(role => {
            const isExpanded = expandedRole === role.id;
            const assignedAgents = agents.filter(a => a.roleIds?.includes(role.id));

            return (
              <div key={role.id} className={cn(
                "bg-zinc-900 border rounded-xl transition-all",
                isExpanded ? "border-indigo-500/50 ring-1 ring-indigo-500/20" : "border-zinc-800"
              )}>
                {/* Header */}
                <div className="p-4">
                  {editingId === role.id ? (
                    <div className="space-y-2">
                      <Input
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        className="bg-zinc-950 text-sm"
                        placeholder="Role name"
                      />
                      <Input
                        value={editDesc}
                        onChange={e => setEditDesc(e.target.value)}
                        className="bg-zinc-950 text-xs"
                        placeholder="Description"
                      />
                      <div className="flex gap-2">
                        <Button size="sm" className="text-xs h-7" onClick={async () => {
                          await updateRole(role.id, { name: editName, description: editDesc });
                          setEditingId(null);
                        }}>Save</Button>
                        <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => setEditingId(null)}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setExpandedRole(isExpanded ? null : role.id)}
                            className="text-sm font-semibold text-zinc-200 hover:text-indigo-400 transition-colors"
                          >
                            {role.name}
                          </button>
                          <button
                            onClick={() => { setEditingId(role.id); setEditName(role.name); setEditDesc(role.description || ''); }}
                            className="text-zinc-600 hover:text-zinc-400"
                          >
                            <Pencil size={12} />
                          </button>
                        </div>
                        {role.description && (
                          <p className="text-xs text-zinc-500 mt-0.5 truncate">{role.description}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1.5">
                          <Badge className="text-[10px]">{role.permissions.length} permissions</Badge>
                          <span className="text-[10px] text-zinc-600">{assignedAgents.length} agents</span>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-zinc-500 hover:text-red-400 h-7 w-7 p-0"
                        onClick={() => handleDelete(role.id)}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  )}
                </div>

                {/* Expanded Permissions */}
                {isExpanded && (
                  <div className="border-t border-zinc-800 px-4 py-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Permissions</h4>
                    </div>

                    {/* Current permissions */}
                    {role.permissions.length === 0 ? (
                      <p className="text-xs text-zinc-600 italic">No permissions assigned.</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {role.permissions.map(perm => {
                          const info = PERMISSION_LABELS[perm.type];
                          return (
                            <div
                              key={perm.type}
                              className={cn(
                                "flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium border group",
                                info?.color || 'text-zinc-400 border-zinc-700 bg-zinc-800'
                              )}
                            >
                              {info?.icon}
                              {info?.label || perm.type}
                              {Array.isArray(perm.scope) && (
                                <span className="text-zinc-500 ml-0.5">({perm.scope.join(', ')})</span>
                              )}
                              <button
                                onClick={() => handleRemovePermission(role.id, perm.type)}
                                className="ml-1 opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-red-400 transition-all"
                              >
                                <X size={10} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Add permission */}
                    <div className="flex items-center gap-2">
                      <CustomSelect
                        value={addPermType}
                        onValueChange={setAddPermType}
                        placeholder="Add permission..."
                        className="flex-1"
                      >
                        {(Object.keys(PERMISSION_LABELS) as PermissionType[])
                          .filter(t => !role.permissions.some(p => p.type === t))
                          .map(t => (
                            <SelectItem key={t} value={t}>
                              <span className="flex items-center gap-1.5">
                                {PERMISSION_LABELS[t].icon}
                                {PERMISSION_LABELS[t].label}
                              </span>
                            </SelectItem>
                          ))}
                      </CustomSelect>
                      <Input
                        value={addPermScope}
                        onChange={e => setAddPermScope(e.target.value)}
                        className="w-32 bg-zinc-950 text-xs"
                        placeholder="Scope (e.g. src/**)"
                      />
                      <Button
                        size="sm"
                        className="text-xs h-8 whitespace-nowrap"
                        disabled={!addPermType}
                        onClick={() => handleAddPermission(role.id)}
                      >
                        Grant
                      </Button>
                    </div>

                    {/* Assigned Agents */}
                    {assignedAgents.length > 0 && (
                      <div className="pt-2 border-t border-zinc-800/50">
                        <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Assigned Agents</h4>
                        <div className="flex flex-wrap gap-1.5">
                          {assignedAgents.map(a => (
                            <Badge key={a.id} className="text-[10px]">
                              <Users size={10} className="mr-1" />
                              {a.name}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Agent Role Assignment */}
        <div className="space-y-3 overflow-y-auto pr-1">
          <h3 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
            <Users size={16} className="text-purple-400" />
            Agent Permissions
            {filterWs && <Badge className="ml-1">{workspaceAgents.length}</Badge>}
          </h3>

          {!filterWs && (
            <div className="text-center py-12 text-zinc-500 text-sm border-2 border-dashed border-zinc-800 rounded-xl">
              Select a workspace to manage agent role assignments.
            </div>
          )}

          {filterWs && workspaceAgents.length === 0 && (
            <div className="text-center py-12 text-zinc-500 text-sm border-2 border-dashed border-zinc-800 rounded-xl">
              No agents in this workspace.
            </div>
          )}

          {filterWs && workspaceAgents.map(agent => {
            const agentRoles = (agent.roleIds || [])
              .map(rid => roles.find(r => r.id === rid))
              .filter(Boolean) as Role[];

            const allPerms = agentRoles.flatMap(r => r.permissions);
            const uniquePerms = new Map<string, PermissionEntry>();
            for (const p of allPerms) {
              uniquePerms.set(p.type, p);
            }

            return (
              <div key={agent.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 bg-zinc-800 text-zinc-300 rounded-lg flex items-center justify-center font-bold text-[10px]">
                    {agent.name.substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <span className="text-sm font-medium text-zinc-200">{agent.name}</span>
                    {agent.role && (
                      <span className="text-[10px] text-zinc-500 ml-1.5">({agent.role})</span>
                    )}
                  </div>
                </div>

                {/* Assigned roles */}
                <div className="flex flex-wrap gap-1.5 items-center">
                  <span className="text-[10px] text-zinc-500 mr-1">Roles:</span>
                  {workspaceRoles.map(role => {
                    const hasRole = agent.roleIds?.includes(role.id);
                    return (
                      <button
                        key={role.id}
                        onClick={() => handleToggleRole(agent, role.id)}
                        className={cn(
                          "px-2 py-0.5 rounded-md text-[10px] font-medium border transition-colors",
                          hasRole
                            ? "bg-indigo-500/15 text-indigo-300 border-indigo-500/30 hover:bg-red-500/15 hover:text-red-300 hover:border-red-500/30"
                            : "bg-zinc-800 text-zinc-500 border-zinc-700 hover:bg-zinc-700 hover:text-zinc-300"
                        )}
                      >
                        {hasRole ? (
                          <span className="flex items-center gap-1">
                            <ShieldCheck size={10} />
                            {role.name}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1">
                            <ShieldOff size={10} />
                            {role.name}
                          </span>
                        )}
                      </button>
                    );
                  })}
                  {workspaceRoles.length === 0 && (
                    <span className="text-[10px] text-zinc-600">No roles in this workspace.</span>
                  )}
                </div>

                {/* Effective permissions */}
                {uniquePerms.size > 0 && (
                  <div className="pt-1 border-t border-zinc-800/50">
                    <span className="text-[10px] text-zinc-500 mb-1.5 block">Effective permissions:</span>
                    <div className="flex flex-wrap gap-1">
                      {Array.from(uniquePerms.entries()).map(([type, perm]) => {
                        const info = PERMISSION_LABELS[type];
                        return (
                          <div
                            key={type}
                            className={cn(
                              "px-1.5 py-0.5 rounded text-[9px] border",
                              info?.color || 'text-zinc-400 border-zinc-700 bg-zinc-800'
                            )}
                          >
                            <span className="flex items-center gap-1">
                              {info?.icon}
                              {info?.label || type}
                              {Array.isArray(perm.scope) && (
                                <span className="text-zinc-500">({perm.scope.join(',')})</span>
                              )}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Create Role Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="absolute inset-0" onClick={() => setShowCreate(false)} />
          <div className="relative w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl">
            <div className="p-6 border-b border-zinc-800">
              <h3 className="text-lg font-semibold text-zinc-100">Create Role</h3>
              <p className="text-sm text-zinc-500 mt-1">Define a new role for {workspaces.find(w => w.id === newWs)?.name || 'workspace'}.</p>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Role Name</label>
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
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Workspace</label>
                <CustomSelect value={newWs} onValueChange={setNewWs} placeholder="Select workspace">
                  {workspaces.map(w => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                </CustomSelect>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button variant="ghost" type="button" onClick={() => setShowCreate(false)}>Cancel</Button>
                <Button type="submit" className="bg-indigo-600 hover:bg-indigo-500">Create Role</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
