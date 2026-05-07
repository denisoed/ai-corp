import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useStore } from '../../store';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { CustomSelect, SelectItem } from '../ui/CustomSelect';
import { ArrowLeft, Play, Square, RotateCcw, Clock, CheckCircle2, XCircle, AlertCircle, User, GanttChartSquare } from 'lucide-react';
import { cn } from '../../lib/utils';

const STATUS_COLORS: Record<string, string> = {
  running: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  paused: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  completed: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  failed: 'bg-red-500/10 text-red-400 border-red-500/20',
  cancelled: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
};

const STAGE_STATUS_ICONS: Record<string, React.ReactNode> = {
  completed: <CheckCircle2 size={14} className="text-blue-400" />,
  failed: <XCircle size={14} className="text-red-400" />,
  pending: <Clock size={14} className="text-amber-400" />,
  skipped: <AlertCircle size={14} className="text-zinc-500" />,
};

export function PipelineDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { pipelines, pipelineInstances, agents, tasks, workspaces, startPipeline, resumePipeline, cancelPipelineInstance, addLog, agents: allAgents } = useStore();
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [showStartModal, setShowStartModal] = useState(false);

  const pipeline = pipelines.find(p => p.id === id);
  const instances = pipelineInstances.filter(pi => pi.pipelineId === id);
  const ws = pipeline ? workspaces.find(w => w.id === pipeline.workspaceId) : undefined;

  if (!pipeline) {
    return (
      <div className="space-y-6">
        <button onClick={() => navigate('/pipelines')} className="flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-200 transition-colors">
          <ArrowLeft size={14} /> Back to pipelines
        </button>
        <div className="flex items-center justify-center py-16 text-zinc-500 text-sm">Pipeline not found.</div>
      </div>
    );
  }

  const handleStart = async () => {
    if (!selectedTaskId) return;
    const agent = allAgents.find(a => a.workspaceId === pipeline.workspaceId);
    if (!agent) return;
    await startPipeline(pipeline.id, selectedTaskId, agent.id);
    addLog({ agentId: 'system', action: 'Pipeline Started', details: `Pipeline "${pipeline.name}" started`, type: 'info', workspaceId: pipeline.workspaceId });
    setShowStartModal(false);
    setSelectedTaskId('');
  };

  const handleResume = async (instanceId: string) => {
    await resumePipeline(pipeline.id, instanceId);
    addLog({ agentId: 'system', action: 'Pipeline Resumed', details: `Pipeline "${pipeline.name}" resumed`, type: 'info', workspaceId: pipeline.workspaceId });
  };

  const handleCancel = async (instanceId: string) => {
    await cancelPipelineInstance(instanceId);
    addLog({ agentId: 'system', action: 'Pipeline Cancelled', details: `Pipeline "${pipeline.name}" cancelled`, type: 'warning', workspaceId: pipeline.workspaceId });
  };

  const activeInstance = instances.find(i => i.status === 'running' || i.status === 'paused');

  return (
    <div className="space-y-6">
      <button onClick={() => navigate('/pipelines')} className="flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-200 transition-colors">
        <ArrowLeft size={14} /> Back to pipelines
      </button>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-zinc-100">{pipeline.name}</h1>
            {activeInstance && (
              <Badge variant="outline" className={cn(STATUS_COLORS[activeInstance.status])}>
                {activeInstance.status}
              </Badge>
            )}
          </div>
          {pipeline.description && (
            <p className="text-sm text-zinc-400 mt-1">{pipeline.description}</p>
          )}
          <p className="text-xs text-zinc-500 mt-1">
            {pipeline.stages.length} stage{pipeline.stages.length !== 1 ? 's' : ''}
            {ws && <> &middot; {ws.name}</>}
            &middot; Created {new Date(pipeline.createdAt).toLocaleDateString()}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setShowStartModal(true)} className="bg-indigo-600 hover:bg-indigo-500 text-white">
            <Play size={14} className="mr-1" /> Start
          </Button>
        </div>
      </div>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
            <GanttChartSquare size={16} className="text-indigo-400" />
            Stages
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-0">
          {pipeline.stages.map((stage, idx) => {
            const InstanceWithStage = instances.find(i => {
              const s = i.stageResults.find(r => r.stageId === stage.id);
              return s !== undefined;
            });
            const stageResult = InstanceWithStage?.stageResults.find(r => r.stageId === stage.id);

            return (
              <div key={stage.id} className={cn(
                "flex items-start gap-3 py-3 border-l-2 pl-4 ml-2 relative",
                idx < pipeline.stages.length - 1 ? "border-zinc-700" : "border-transparent",
                stageResult?.status === 'completed' ? "border-l-blue-500" : "",
                stageResult?.status === 'failed' ? "border-l-red-500" : "",
                stageResult?.status === 'pending' ? "border-l-amber-500" : "",
              )}>
                <div className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5",
                  stageResult?.status === 'completed' ? "bg-blue-500/20 text-blue-400" :
                  stageResult?.status === 'failed' ? "bg-red-500/20 text-red-400" :
                  stageResult?.status === 'pending' ? "bg-amber-500/20 text-amber-400" :
                  "bg-zinc-800 text-zinc-500"
                )}>
                  {stageResult?.status === 'completed' ? <CheckCircle2 size={14} /> :
                   stageResult?.status === 'failed' ? <XCircle size={14} /> :
                   stageResult?.status === 'pending' ? <Clock size={14} /> :
                   idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-semibold text-zinc-200">{stage.name}</h4>
                    <span className="text-xs text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">{stage.assigneeRole}</span>
                    {stage.transition !== 'auto' && (
                      <Badge variant="outline" className="text-[10px] px-1 py-0 bg-zinc-800 text-zinc-400 border-zinc-700">
                        {stage.transition === 'approval_required' ? 'approval' : 'manual'}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-zinc-400 mt-0.5 line-clamp-2">{stage.instructions}</p>
                  {stage.expectedOutput && (
                    <p className="text-xs text-zinc-500 mt-0.5 italic">Expected: {stage.expectedOutput}</p>
                  )}
                  {stage.timeoutMinutes && (
                    <p className="text-xs text-zinc-600 mt-0.5">Timeout: {stage.timeoutMinutes} min</p>
                  )}
                  {stageResult && stageResult.agentName && (
                    <div className="flex items-center gap-1 mt-1 text-xs text-zinc-500">
                      <User size={10} />
                      <span>{stageResult.agentName}</span>
                      {stageResult.completedAt && (
                        <span className="ml-2">{new Date(stageResult.completedAt).toLocaleString()}</span>
                      )}
                    </div>
                  )}
                  {stageResult?.output && (
                    <p className="text-xs text-zinc-500 mt-1 bg-zinc-950 rounded p-2 border border-zinc-800/50 line-clamp-3">{stageResult.output}</p>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
            <Clock size={16} className="text-indigo-400" />
            Run History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {instances.length === 0 ? (
            <p className="text-sm text-zinc-500 py-4 text-center">No runs yet. Start the pipeline to see results.</p>
          ) : (
            <div className="space-y-2">
              {instances.map(inst => {
                const task = tasks.find(t => t.id === inst.taskId);
                const currentStage = pipeline.stages[inst.currentStageIndex];
                return (
                  <div key={inst.id} className="flex items-center justify-between bg-zinc-950 rounded-lg border border-zinc-800 p-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", STATUS_COLORS[inst.status] || 'bg-zinc-800 text-zinc-400')}>
                          {inst.status}
                        </Badge>
                        <span className="text-xs text-zinc-400 font-mono">{new Date(inst.createdAt).toLocaleString()}</span>
                      </div>
                      {task && (
                        <p className="text-xs text-zinc-300 mt-1">Task: {task.title}</p>
                      )}
                      {inst.status === 'running' && currentStage && (
                        <p className="text-xs text-zinc-500 mt-0.5">Current stage: {currentStage.name}</p>
                      )}
                      {inst.status === 'paused' && currentStage && (
                        <p className="text-xs text-amber-400 mt-0.5">Paused at: {currentStage.name}</p>
                      )}
                      {inst.error && (
                        <p className="text-xs text-red-400 mt-0.5">{inst.error}</p>
                      )}
                      {inst.completedAt && (
                        <p className="text-xs text-zinc-600 mt-0.5">Completed: {new Date(inst.completedAt).toLocaleString()}</p>
                      )}
                      <div className="flex items-center gap-1 mt-1">
                        {pipeline.stages.map((stage, sIdx) => {
                          const result = inst.stageResults.find(r => r.stageId === stage.id);
                          return (
                            <div
                              key={stage.id}
                              className={cn(
                                "w-2 h-2 rounded-full",
                                result?.status === 'completed' ? "bg-blue-500" :
                                result?.status === 'failed' ? "bg-red-500" :
                                result?.status === 'pending' ? "bg-amber-500" :
                                sIdx < inst.currentStageIndex ? "bg-zinc-600" :
                                sIdx === inst.currentStageIndex && inst.status === 'running' ? "bg-emerald-500 animate-pulse" :
                                "bg-zinc-700"
                              )}
                              title={`${stage.name}: ${result?.status || 'pending'}`}
                            />
                          );
                        })}
                      </div>
                    </div>
                    <div className="flex gap-1 ml-3 shrink-0">
                      {inst.status === 'paused' && (
                        <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => handleResume(inst.id)}>
                          <RotateCcw size={12} className="mr-1" /> Resume
                        </Button>
                      )}
                      {(inst.status === 'running' || inst.status === 'paused') && (
                        <Button size="sm" variant="ghost" className="text-xs h-7 text-red-400" onClick={() => handleCancel(inst.id)}>
                          <Square size={12} className="mr-1" /> Cancel
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {showStartModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="absolute inset-0" onClick={() => setShowStartModal(false)} />
          <div className="relative w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-zinc-800">
              <h3 className="text-lg font-semibold text-zinc-100">Start Pipeline</h3>
              <p className="text-sm text-zinc-500 mt-1">Select a task to run "{pipeline.name}" on.</p>
            </div>
            <div className="p-6 space-y-4">
              <CustomSelect value={selectedTaskId} onValueChange={setSelectedTaskId} placeholder="Select task">
                {tasks.filter(t => t.status !== 'Done').map(t => (
                  <SelectItem key={t.id} value={t.id}>{t.title} ({t.status})</SelectItem>
                ))}
              </CustomSelect>
              <div className="flex justify-end gap-3">
                <Button variant="ghost" onClick={() => setShowStartModal(false)}>Cancel</Button>
                <Button onClick={handleStart} disabled={!selectedTaskId} className="bg-indigo-600 hover:bg-indigo-500 text-white">
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