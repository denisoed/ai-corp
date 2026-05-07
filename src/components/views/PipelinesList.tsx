import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../../store';
import { Card, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { CustomSelect, SelectItem } from '../ui/CustomSelect';
import { Input } from '../ui/Input';
import { Plus, Trash2, Play, Square, Eye, Layers, Workflow, GanttChartSquare } from 'lucide-react';
import { cn } from '../../lib/utils';
import { ConfirmDialog } from '../ui/ConfirmDialog';

const PIPELINE_STATUS_COLORS: Record<string, string> = {
  running: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  paused: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  completed: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  failed: 'bg-red-500/10 text-red-400 border-red-500/20',
  cancelled: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
};

export function PipelinesList() {
  const navigate = useNavigate();
  const { pipelines, pipelineInstances, workspaces, agents, tasks, createPipeline, deletePipeline, startPipeline, cancelPipelineInstance, addLog } = useStore();
  const [showCreate, setShowCreate] = useState(false);
  const [filterWs, setFilterWs] = useState('');

  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newWs, setNewWs] = useState('');
  const [newStages, setNewStages] = useState<Array<{ name: string; role: string; instructions: string; transition: string }>>([]);

  const [showStartModal, setShowStartModal] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  const filtered = filterWs
    ? pipelines.filter(p => p.workspaceId === filterWs)
    : pipelines;

  const getActiveInstances = (pipelineId: string) =>
    pipelineInstances.filter(pi => pi.pipelineId === pipelineId && (pi.status === 'running' || pi.status === 'paused'));

  const addStage = () => {
    setNewStages([...newStages, { name: '', role: 'Developer', instructions: '', transition: 'auto' }]);
  };

  const removeStage = (idx: number) => {
    setNewStages(newStages.filter((_, i) => i !== idx));
  };

  const updateStage = (idx: number, field: string, value: string) => {
    const updated = [...newStages];
    (updated[idx] as any)[field] = value;
    setNewStages(updated);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || !newWs || newStages.length === 0) return;
    const agent = agents.find(a => a.workspaceId === newWs);
    if (!agent) return;

    await createPipeline({
      name: newName,
      description: newDesc || undefined,
      agentId: agent.id,
      stages: newStages.map(s => ({
        name: s.name,
        assigneeRole: s.role,
        instructions: s.instructions,
        transition: s.transition,
      })),
    });
    addLog({ agentId: 'system', action: 'Pipeline Created', details: `Pipeline "${newName}" created`, type: 'success', workspaceId: newWs });
    setShowCreate(false);
    setNewName(''); setNewDesc(''); setNewWs(''); setNewStages([]);
  };

  const handleDelete = async (id: string, name: string) => {
    await deletePipeline(id);
    addLog({ agentId: 'system', action: 'Pipeline Deleted', details: `Pipeline "${name}" deleted`, type: 'warning' });
    setShowDeleteConfirm(null);
  };

  const handleStop = async (pipelineId: string) => {
    const active = getActiveInstances(pipelineId);
    for (const inst of active) {
      await cancelPipelineInstance(inst.id);
    }
    const p = pipelines.find(p => p.id === pipelineId);
    addLog({ agentId: 'system', action: 'Pipeline Stopped', details: `Pipeline "${p?.name}" stopped`, type: 'warning' });
  };

  const handleStart = async (pipelineId: string) => {
    if (!selectedTaskId) return;
    const pipeline = pipelines.find(p => p.id === pipelineId);
    const agent = agents.find(a => a.workspaceId === pipeline?.workspaceId);
    if (!agent) return;
    await startPipeline(pipelineId, selectedTaskId, agent.id);
    const p = pipelines.find(p => p.id === pipelineId);
    addLog({ agentId: 'system', action: 'Pipeline Started', details: `Pipeline "${p?.name}" started on task`, type: 'info' });
    setShowStartModal(null);
    setSelectedTaskId('');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 flex-none shrink-0 border-b border-zinc-800 pb-4">
        <div>
          <h2 className="text-xs uppercase font-bold tracking-widest text-zinc-500">Pipelines</h2>
          <p className="text-sm text-zinc-400 mt-1">Multi-stage agent workflows that run sequentially.</p>
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
            Create Pipeline
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-zinc-500 text-sm">
          No pipelines yet. Create one to define multi-stage agent workflows.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map(pipeline => {
            const ws = workspaces.find(w => w.id === pipeline.workspaceId);
            const activeInstances = getActiveInstances(pipeline.id);
            const allInstances = pipelineInstances.filter(pi => pi.pipelineId === pipeline.id);

            return (
              <Card key={pipeline.id} className="bg-zinc-900 border-zinc-800 overflow-hidden">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-zinc-100 text-sm truncate">{pipeline.name}</h3>
                      {pipeline.description && (
                        <p className="text-xs text-zinc-500 mt-0.5 line-clamp-1">{pipeline.description}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="flex items-center gap-1 text-zinc-400">
                      <Layers size={12} />
                      {pipeline.stages.length} stage{pipeline.stages.length !== 1 ? 's' : ''}
                    </span>
                    {ws && (
                      <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400" style={{ borderLeft: `2px solid ${ws.color || '#6366f1'}` }}>
                        {ws.name}
                      </span>
                    )}
                    {activeInstances.length > 0 && (
                      <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", PIPELINE_STATUS_COLORS['running'])}>
                        {activeInstances.length} active
                      </Badge>
                    )}
                  </div>

                  <div className="space-y-1">
                    {pipeline.stages.slice(0, 4).map((stage, idx) => (
                      <div key={stage.id} className="flex items-center gap-2 text-xs bg-zinc-950 rounded px-2 py-1.5 border border-zinc-800/50">
                        <span className="w-4 h-4 rounded-full bg-zinc-800 text-zinc-400 flex items-center justify-center text-[10px] font-bold shrink-0">{idx + 1}</span>
                        <span className="text-zinc-300 truncate flex-1">{stage.name}</span>
                        <span className="text-zinc-500 shrink-0">{stage.assigneeRole}</span>
                        {stage.transition !== 'auto' && (
                          <Badge variant="outline" className="text-[10px] px-1 py-0 bg-zinc-800 text-zinc-400 border-zinc-700">
                            {stage.transition === 'approval_required' ? 'approval' : 'manual'}
                          </Badge>
                        )}
                      </div>
                    ))}
                    {pipeline.stages.length > 4 && (
                      <p className="text-xs text-zinc-600 text-center pt-1">+{pipeline.stages.length - 4} more stages</p>
                    )}
                  </div>

                  {allInstances.length > 0 && (
                    <div className="text-xs text-zinc-500">
                      Last run: {new Date(allInstances[0].createdAt).toLocaleDateString()}
                    </div>
                  )}

                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-7 flex-1"
                      onClick={() => navigate(`/pipelines/${pipeline.id}`)}
                    >
                      <Eye size={12} className="mr-1" />
                      Details
                    </Button>
                    {activeInstances.length > 0 ? (
                      <Button
                        size="sm"
                        className="text-xs h-7 flex-1 bg-red-600 hover:bg-red-500 text-white"
                        onClick={() => handleStop(pipeline.id)}
                      >
                        <Square size={12} className="mr-1" />
                        Stop
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="text-xs h-7 flex-1 bg-indigo-600 hover:bg-indigo-500 text-white"
                        onClick={() => { setShowStartModal(pipeline.id); setSelectedTaskId(''); }}
                      >
                        <Play size={12} className="mr-1" />
                        Start
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs h-7 px-2 text-red-400 hover:text-red-300"
                      onClick={() => setShowDeleteConfirm(pipeline.id)}
                    >
                      <Trash2 size={12} />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="absolute inset-0" onClick={() => setShowCreate(false)} />
          <div className="relative w-full max-w-2xl bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-zinc-800 flex justify-between items-start bg-zinc-900/40 shrink-0">
              <div>
                <h3 className="text-xl font-semibold text-zinc-100">Create Pipeline</h3>
                <p className="text-sm text-zinc-500 mt-1">Define a multi-stage workflow with agent roles.</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setShowCreate(false)} className="rounded-full w-8 h-8 p-0 flex items-center justify-center -mt-2 -mr-2">×</Button>
            </div>

            <div className="p-6 overflow-y-auto">
              <form id="create-pipeline-form" onSubmit={handleCreate} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Name</label>
                    <Input value={newName} onChange={e => setNewName(e.target.value)} required placeholder="e.g. SDLC" className="bg-zinc-900 shadow-inner border-zinc-800" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Workspace</label>
                    <CustomSelect value={newWs} onValueChange={setNewWs} placeholder="Select workspace">
                      {workspaces.map(w => (
                        <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                      ))}
                    </CustomSelect>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Description</label>
                  <Input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="What does this pipeline do?" className="bg-zinc-900 shadow-inner border-zinc-800" />
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Stages</label>
                    <Button type="button" size="sm" variant="outline" onClick={addStage} className="text-xs h-7">
                      <Plus size={12} className="mr-1" /> Add Stage
                    </Button>
                  </div>
                  {newStages.length === 0 && (
                    <p className="text-xs text-zinc-600 py-2">No stages yet. Add at least one stage.</p>
                  )}
                  {newStages.map((stage, idx) => (
                    <div key={idx} className="bg-zinc-900 rounded-lg border border-zinc-800 p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-zinc-400">Stage {idx + 1}</span>
                        <Button type="button" size="sm" variant="ghost" className="text-xs h-6 px-2 text-red-400" onClick={() => removeStage(idx)}>
                          <Trash2 size={10} className="mr-1" /> Remove
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Input value={stage.name} onChange={e => updateStage(idx, 'name', e.target.value)} placeholder="Stage name" className="bg-zinc-950 text-sm" required />
                        <CustomSelect value={stage.role} onValueChange={v => updateStage(idx, 'role', v)} placeholder="Role">
                          {['Developer', 'Reviewer', 'DevOps', 'Research', 'Analyst', 'Manager', 'Designer'].map(r => (
                            <SelectItem key={r} value={r}>{r}</SelectItem>
                          ))}
                        </CustomSelect>
                      </div>
                      <textarea
                        value={stage.instructions}
                        onChange={e => updateStage(idx, 'instructions', e.target.value)}
                        rows={2}
                        className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 font-mono focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500"
                        placeholder="Instructions for the agent..."
                        required
                      />
                      <CustomSelect value={stage.transition} onValueChange={v => updateStage(idx, 'transition', v)} placeholder="Transition">
                        <SelectItem value="auto">Auto (proceed immediately)</SelectItem>
                        <SelectItem value="approval_required">Approval Required</SelectItem>
                        <SelectItem value="manual">Manual (wait for trigger)</SelectItem>
                      </CustomSelect>
                    </div>
                  ))}
                </div>
              </form>
            </div>

            <div className="p-6 border-t border-zinc-800 bg-zinc-950 flex justify-end gap-3 shrink-0">
              <Button variant="ghost" type="button" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button type="submit" form="create-pipeline-form" className="bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/25" disabled={newStages.length === 0}>Create Pipeline</Button>
            </div>
          </div>
        </div>
      )}

      {showDeleteConfirm && (() => {
        const p = pipelines.find(pl => pl.id === showDeleteConfirm);
        return (
          <ConfirmDialog
            title="Delete Pipeline"
            message={`Are you sure you want to delete "${p?.name}"? This action cannot be undone.`}
            onConfirm={() => p && handleDelete(p.id, p.name)}
            onCancel={() => setShowDeleteConfirm(null)}
          />
        );
      })()}

      {showStartModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="absolute inset-0" onClick={() => setShowStartModal(null)} />
          <div className="relative w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-zinc-800">
              <h3 className="text-lg font-semibold text-zinc-100">Start Pipeline</h3>
              <p className="text-sm text-zinc-500 mt-1">Select a task to run this pipeline on.</p>
            </div>
            <div className="p-6 space-y-4">
              <CustomSelect value={selectedTaskId} onValueChange={setSelectedTaskId} placeholder="Select task">
                {tasks.filter(t => t.status !== 'Done').map(t => (
                  <SelectItem key={t.id} value={t.id}>{t.title} ({t.status})</SelectItem>
                ))}
              </CustomSelect>
              <div className="flex justify-end gap-3">
                <Button variant="ghost" onClick={() => setShowStartModal(null)}>Cancel</Button>
                <Button onClick={() => handleStart(showStartModal!)} disabled={!selectedTaskId} className="bg-indigo-600 hover:bg-indigo-500 text-white">
                  <Play size={14} className="mr-1" /> Start
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}