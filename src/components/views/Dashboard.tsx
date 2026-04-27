import React from 'react';
import { useStore } from '../../store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/Card';
import { Activity, CheckCircle2, ShieldAlert } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';

export function Dashboard() {
  const { agents, tasks, logs, totalCost, approvals, resolveApproval } = useStore();

  const activeTasks = tasks.filter(t => t.status === 'In Progress').length;
  const blockedTasks = tasks.filter(t => t.status === 'Blocked' || t.status === 'Failed').length;
  const needApprovalTasks = tasks.filter(t => t.status === 'Needs Approval' || t.status === 'Review').length;
  const completedTasks = tasks.filter(t => t.status === 'Done').length;
  
  const pendingApprovals = approvals.filter(a => a.status === 'pending');

  return (
    <div className="space-y-6">
      {/* Top Overview Ribbon */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card className="bg-zinc-950/50">
          <CardContent className="p-4 flex flex-col items-center justify-center text-center">
            <span className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1">Active</span>
            <span className="text-3xl font-bold text-emerald-400">{activeTasks}</span>
          </CardContent>
        </Card>
        <Card className="bg-zinc-950/50 border-red-500/20">
          <CardContent className="p-4 flex flex-col items-center justify-center text-center">
            <span className="text-red-500/70 text-xs font-semibold uppercase tracking-wider mb-1">Blocked</span>
            <span className="text-3xl font-bold text-red-500">{blockedTasks}</span>
          </CardContent>
        </Card>
        <Card className="bg-zinc-950/50 border-amber-500/20">
          <CardContent className="p-4 flex flex-col items-center justify-center text-center">
            <span className="text-amber-500/70 text-xs font-semibold uppercase tracking-wider mb-1">Need Approval</span>
            <span className="text-3xl font-bold text-amber-500">{needApprovalTasks + pendingApprovals.length}</span>
          </CardContent>
        </Card>
        <Card className="bg-zinc-950/50">
          <CardContent className="p-4 flex flex-col items-center justify-center text-center">
            <span className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1">PR Ready / Done</span>
            <span className="text-3xl font-bold text-zinc-100">{completedTasks}</span>
          </CardContent>
        </Card>
        <Card className="bg-zinc-950/50 border-indigo-500/20">
          <CardContent className="p-4 flex flex-col items-center justify-center text-center">
            <span className="text-indigo-500/70 text-xs font-semibold uppercase tracking-wider mb-1">Cost Today</span>
            <span className="text-3xl font-bold text-indigo-400">${totalCost.toFixed(2)}</span>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Left Column: Agents */}
        <Card className="col-span-1 bg-zinc-950/50 border-zinc-800">
          <CardHeader className="p-4 border-b border-zinc-800">
            <CardTitle className="text-sm">Agents</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-zinc-800/50">
              {agents.map(agent => (
                <div key={agent.id} className="p-4 flex justify-between items-center group hover:bg-zinc-900/50 transition-colors">
                  <div>
                    <div className="flex items-center gap-2">
                       <span className="font-semibold text-sm text-zinc-200">{agent.name}</span>
                       {agent.status === 'Working' && <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />}
                       {agent.status === 'Idle' && <span className="flex h-2 w-2 rounded-full bg-zinc-600" />}
                       {(agent.status === 'Blocked' || agent.status === 'Error') && <span className="flex h-2 w-2 rounded-full bg-red-500" />}
                    </div>
                    <div className="text-xs text-zinc-500 mt-1">{agent.role}</div>
                  </div>
                  <Badge variant="outline" className="text-zinc-500 border-zinc-800 text-[10px] uppercase font-mono">
                    {agent.status}
                  </Badge>
                </div>
              ))}
              {agents.length === 0 && (
                <div className="p-4 text-sm text-zinc-500 italic text-center">No agents deployed.</div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Center Task List (Simplified) */}
        <Card className="col-span-1 bg-zinc-950/50 border-zinc-800">
          <CardHeader className="p-4 border-b border-zinc-800">
            <CardTitle className="text-sm">Active Tasks</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-zinc-800/50">
              {tasks.filter(t => t.status !== 'Done' && t.status !== 'Backlog' && t.status !== 'Planned').map(task => (
                <div key={task.id} className="p-4 group hover:bg-zinc-900/50 transition-colors">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-xs font-mono text-zinc-500">TASK-{task.id.split('-')[0].substring(0,4).toUpperCase()}</span>
                    <Badge variant="outline" className={`text-[10px] ${
                      task.status === 'In Progress' ? 'text-blue-400 border-blue-400/20' :
                      task.status === 'Needs Approval' || task.status === 'Review' ? 'text-amber-400 border-amber-400/20' :
                      task.status === 'Failed' || task.status === 'Blocked' ? 'text-red-400 border-red-400/20' : 'text-zinc-400'
                    }`}>
                      {task.status}
                    </Badge>
                  </div>
                  <p className="text-sm font-semibold text-zinc-200 line-clamp-1">{task.title}</p>
                </div>
              ))}
              {tasks.filter(t => t.status !== 'Done' && t.status !== 'Backlog' && t.status !== 'Planned').length === 0 && (
                <div className="p-4 text-sm text-zinc-500 italic text-center">No active tasks.</div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Right Column: Approvals (Critical) */}
        <Card className="col-span-1 border-amber-500/20 bg-amber-500/5 shadow-[0_0_30px_rgba(245,158,11,0.05)] relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-500/0 via-amber-500/50 to-amber-500/0" />
          <CardHeader className="p-4 border-b border-amber-500/10">
            <CardTitle className="text-sm flex items-center gap-2 text-amber-500">
              <ShieldAlert size={16} /> Needs your approval
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-amber-500/10">
              {pendingApprovals.map(approval => {
                const agent = agents.find(a => a.id === approval.agentId);
                return (
                  <div key={approval.id} className="p-4 bg-zinc-950/40">
                    <div className="flex justify-between items-start mb-2">
                       <span className="text-xs font-semibold text-amber-500/80">Agent: {agent?.name || 'Unknown'}</span>
                       <Badge variant="outline" className="text-[10px] text-red-400 border-red-400/20 bg-red-400/10">Risk: {approval.risk}</Badge>
                    </div>
                    <p className="text-sm font-medium text-zinc-200 mb-1">{approval.action}</p>
                    {approval.details && <p className="text-xs text-zinc-500 mb-3">{approval.details}</p>}
                    <div className="flex items-center gap-4 text-xs font-mono text-zinc-500 mb-4">
                      <span>Est. Cost: ${approval.estimatedCost.toFixed(2)}</span>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => resolveApproval(approval.id, false)} className="w-1/2 border-zinc-700 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30">Reject</Button>
                      <Button size="sm" onClick={() => resolveApproval(approval.id, true)} className="w-1/2 bg-amber-500 hover:bg-amber-600 text-amber-950 font-bold shadow-lg shadow-amber-500/20">Approve</Button>
                    </div>
                  </div>
                )
              })}
              {pendingApprovals.length === 0 && (
                <div className="p-6 text-center text-zinc-500">
                  <CheckCircle2 size={24} className="mx-auto mb-2 opacity-20" />
                  <p className="text-sm">All clear. No pending approvals.</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Live Feed */}
      <Card className="bg-zinc-950/50 border-zinc-800">
        <CardHeader className="px-6 py-4 border-b border-zinc-800">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="h-4 w-4 text-zinc-500" />
            Live Activity Feed
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[300px] overflow-y-auto w-full">
            <table className="w-full text-sm text-left">
              <tbody className="divide-y divide-zinc-800/50">
                {logs.slice(0, 10).map(log => {
                   const agent = agents.find(a => a.id === log.agentId);
                   return (
                      <tr key={log.id} className="hover:bg-zinc-900/30 transition-colors">
                        <td className="py-3 px-6 whitespace-nowrap text-zinc-500 font-mono text-xs w-32">
                          {new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit'})}
                        </td>
                        <td className="py-3 px-6 whitespace-nowrap w-48">
                          <span className="font-medium text-zinc-300">{agent?.name || 'System'}</span>
                        </td>
                        <td className="py-3 px-6 text-zinc-400">
                          {log.action} <span className="text-zinc-600 ml-2">— {log.details}</span>
                        </td>
                      </tr>
                   )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
