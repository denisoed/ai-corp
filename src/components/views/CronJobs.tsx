import React, { useState, useEffect } from 'react';
import { useStore } from '../../store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Badge } from '../ui/Badge';
import { CustomSelect, SelectItem } from '../ui/CustomSelect';
import { Plus, Trash2, Play, Pencil, X, Clock, User as UserIcon, Check, RotateCw } from 'lucide-react';
import { cn } from '../../lib/utils';

const STATUS_COLORS: Record<string, string> = {
  success: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  error: 'bg-red-500/10 text-red-400 border-red-500/20',
  running: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
};

export function CronJobs() {
  const { crons, agents, workspaces, fetchCrons, addCron, updateCron, removeCron, runCron, addLog } = useStore();
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterWs, setFilterWs] = useState('');
  const [runningIds, setRunningIds] = useState<Set<string>>(new Set());

  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newAgent, setNewAgent] = useState('');
  const [newWs, setNewWs] = useState('');
  const [newSchedule, setNewSchedule] = useState('');
  const [newPrompt, setNewPrompt] = useState('');

  const [editSchedule, setEditSchedule] = useState('');
  const [editPrompt, setEditPrompt] = useState('');
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');

  useEffect(() => {
    fetchCrons();
  }, [fetchCrons]);

  const filtered = filterWs
    ? crons.filter(c => c.workspaceId === filterWs)
    : crons;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || !newAgent || !newWs || !newSchedule || !newPrompt) return;
    await addCron({
      name: newName,
      description: newDesc || undefined,
      agentId: newAgent,
      workspaceId: newWs,
      schedule: newSchedule,
      prompt: newPrompt,
      enabled: true,
    });
    addLog({ agentId: 'system', action: 'Cron Created', details: `Cron "${newName}" created`, type: 'success' });
    setShowCreate(false);
    setNewName(''); setNewDesc(''); setNewAgent(''); setNewWs(''); setNewSchedule(''); setNewPrompt('');
  };

  const handleDelete = async (id: string, name: string) => {
    await removeCron(id);
    addLog({ agentId: 'system', action: 'Cron Deleted', details: `Cron "${name}" deleted`, type: 'warning' });
  };

  const handleRun = async (id: string) => {
    runningIds.add(id);
    setRunningIds(new Set(runningIds));
    await runCron(id);
    runningIds.delete(id);
    setRunningIds(new Set(runningIds));
  };

  const startEdit = (cron: typeof crons[0]) => {
    setEditingId(cron.id);
    setEditName(cron.name);
    setEditDesc(cron.description || '');
    setEditSchedule(cron.schedule);
    setEditPrompt(cron.prompt);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    await updateCron(editingId, {
      name: editName,
      description: editDesc || undefined,
      schedule: editSchedule,
      prompt: editPrompt,
    });
    addLog({ agentId: 'system', action: 'Cron Updated', details: `Cron "${editName}" updated`, type: 'info' });
    setEditingId(null);
  };

  const toggleEnabled = async (cron: typeof crons[0]) => {
    await updateCron(cron.id, { enabled: !cron.enabled });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 flex-none shrink-0 border-b border-zinc-800 pb-4">
        <div>
          <h2 className="text-xs uppercase font-bold tracking-widest text-zinc-500">Cron Jobs</h2>
          <p className="text-sm text-zinc-400 mt-1">Scheduled tasks that agents execute automatically on a timer.</p>
        </div>
        <div className="flex gap-2">
          <CustomSelect
            value={filterWs}
            onValueChange={(v) => { setFilterWs(v === '__all__' ? '' : v); }}
            placeholder="All workspaces"
          >
            <SelectItem value="__all__">All workspaces</SelectItem>
            {workspaces.map(w => (
              <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
            ))}
          </CustomSelect>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create Cron
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-zinc-500 text-sm">
          No cron jobs yet. Create one to schedule agent work.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map(cron => {
            const agent = agents.find(a => a.id === cron.agentId);
            const ws = workspaces.find(w => w.id === cron.workspaceId);
            const isEditing = editingId === cron.id;

            return (
              <Card key={cron.id} className="bg-zinc-900 border-zinc-800 overflow-hidden">
                <CardContent className="p-4 space-y-3">
                  {isEditing ? (
                    <div className="space-y-3">
                      <Input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Name" className="bg-zinc-950 text-sm" />
                      <Input value={editDesc} onChange={e => setEditDesc(e.target.value)} placeholder="Description (optional)" className="bg-zinc-950 text-sm" />
                      <Input value={editSchedule} onChange={e => setEditSchedule(e.target.value)} placeholder="Cron expression" className="bg-zinc-950 font-mono text-sm" />
                      <textarea
                        value={editPrompt}
                        onChange={e => setEditPrompt(e.target.value)}
                        rows={4}
                        className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 font-mono focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500"
                        placeholder="Prompt for agent..."
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={saveEdit} className="text-xs"><Check size={12} className="mr-1" /> Save</Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} className="text-xs"><X size={12} className="mr-1" /> Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-zinc-100 text-sm truncate">{cron.name}</h3>
                          {cron.description && (
                            <p className="text-xs text-zinc-500 mt-0.5 line-clamp-1">{cron.description}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0 ml-2">
                          <button
                            onClick={() => toggleEnabled(cron)}
                            className={cn(
                              "w-7 h-7 rounded-md flex items-center justify-center text-xs border transition-colors",
                              cron.enabled
                                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                                : "bg-zinc-800 border-zinc-700 text-zinc-500"
                            )}
                            title={cron.enabled ? 'Enabled' : 'Disabled'}
                          >
                            {cron.enabled ? 'ON' : 'OFF'}
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="flex items-center gap-1 text-zinc-400">
                          <UserIcon size={12} />
                          {agent?.name || 'unknown'}
                        </span>
                        {ws && (
                          <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400" style={{ borderLeft: `2px solid ${ws.color || '#6366f1'}` }}>
                            {ws.name}
                          </span>
                        )}
                      </div>

                      <div className="bg-zinc-950 rounded-md p-2.5 border border-zinc-800 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <Clock size={12} className="text-indigo-400" />
                          <code className="text-xs font-mono text-indigo-400">{cron.schedule}</code>
                        </div>
                        <p className="text-xs text-zinc-500 line-clamp-3 whitespace-pre-wrap">{cron.prompt}</p>
                      </div>

                      {cron.lastRunAt && (
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-zinc-500">Last run:</span>
                          <span className="text-zinc-400 font-mono">{new Date(cron.lastRunAt).toLocaleString()}</span>
                          {cron.lastStatus && (
                            <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", STATUS_COLORS[cron.lastStatus] || 'bg-zinc-800 text-zinc-400')}>
                              {cron.lastStatus}
                            </Badge>
                          )}
                        </div>
                      )}

                      {cron.lastResult && (
                        <div className="text-xs text-zinc-600 line-clamp-2 italic border-l-2 border-zinc-800 pl-2">
                          {cron.lastResult}
                        </div>
                      )}

                      <div className="flex gap-2 pt-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs h-7 flex-1"
                          onClick={() => handleRun(cron.id)}
                          disabled={runningIds.has(cron.id)}
                        >
                          {runningIds.has(cron.id)
                            ? <RotateCw size={12} className="mr-1 animate-spin" />
                            : <Play size={12} className="mr-1" />
                          }
                          Run Now
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-xs h-7 px-2"
                          onClick={() => startEdit(cron)}
                        >
                          <Pencil size={12} />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-xs h-7 px-2 text-red-400 hover:text-red-300"
                          onClick={() => handleDelete(cron.id, cron.name)}
                        >
                          <Trash2 size={12} />
                        </Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="absolute inset-0" onClick={() => setShowCreate(false)} />
          <div className="relative w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-zinc-800 flex justify-between items-start bg-zinc-900/40 shrink-0">
              <div>
                <h3 className="text-xl font-semibold text-zinc-100">Create Cron Job</h3>
                <p className="text-sm text-zinc-500 mt-1">Schedule an agent to execute a task on a timer.</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setShowCreate(false)} className="rounded-full w-8 h-8 p-0 flex items-center justify-center -mt-2 -mr-2">×</Button>
            </div>

            <div className="p-6 overflow-y-auto">
              <form id="create-cron-form" onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Name</label>
                  <Input value={newName} onChange={e => setNewName(e.target.value)} required placeholder="e.g. Check GitHub Issues" className="bg-zinc-900 shadow-inner border-zinc-800" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Description</label>
                  <Input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="What does this cron do?" className="bg-zinc-900 shadow-inner border-zinc-800" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Workspace</label>
                  <CustomSelect value={newWs} onValueChange={setNewWs} placeholder="Select workspace">
                    {workspaces.map(w => (
                      <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                    ))}
                  </CustomSelect>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Agent</label>
                  <CustomSelect value={newAgent} onValueChange={setNewAgent} placeholder="Select agent">
                    {agents.filter(a => !newWs || a.workspaceId === newWs).map(a => (
                      <SelectItem key={a.id} value={a.id}>{a.name}{a.role ? ` (${a.role})` : ''}</SelectItem>
                    ))}
                  </CustomSelect>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Cron Schedule</label>
                  <Input value={newSchedule} onChange={e => setNewSchedule(e.target.value)} required placeholder="*/30 * * * * (every 30 min)" className="bg-zinc-900 shadow-inner border-zinc-800 font-mono text-sm" />
                  <p className="text-xs text-zinc-500 leading-tight">Cron expression. Examples: <code className="text-indigo-400">*/15 * * * *</code> every 15 min, <code className="text-indigo-400">0 */6 * * *</code> every 6h, <code className="text-indigo-400">0 9 * * 1</code> Mon 9am, <code className="text-indigo-400">0 0 * * *</code> midnight daily.</p>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Prompt</label>
                  <textarea
                    value={newPrompt}
                    onChange={e => setNewPrompt(e.target.value)}
                    required
                    rows={5}
                    className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-100 font-mono focus-visible:outline-none shadow-inner focus-visible:ring-1 focus-visible:ring-indigo-500 focus-visible:border-indigo-500"
                    placeholder="Instruction for the agent. Example: Go to https://github.com/org/repo/issues and check for new issues. For each new issue, create a task with appropriate priority and assignee."
                  />
                </div>
              </form>
            </div>

            <div className="p-6 border-t border-zinc-800 bg-zinc-950 flex justify-end gap-3 shrink-0">
              <Button variant="ghost" type="button" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button type="submit" form="create-cron-form" className="bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/25">Create Cron</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
