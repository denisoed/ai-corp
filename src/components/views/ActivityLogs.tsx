import React, { useMemo, useState } from 'react';
import { useStore } from '../../store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/Card';
import { Tabs, TabPanel } from '../ui/Tabs';
import { Badge } from '../ui/Badge';
import { cn } from '../../lib/utils';

type LogTab = 'system' | string;
type LogFilter = 'all' | 'info' | 'success' | 'warning' | 'error';

const FILTERS: Array<{ id: LogFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'info', label: 'Info' },
  { id: 'success', label: 'Success' },
  { id: 'warning', label: 'Warning' },
  { id: 'error', label: 'Error' },
];

function filterTone(filter: LogFilter): string {
  switch (filter) {
    case 'info':
      return 'bg-blue-500/15 text-blue-300 border-blue-500/30';
    case 'success':
      return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
    case 'warning':
      return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
    case 'error':
      return 'bg-red-500/15 text-red-300 border-red-500/30';
    case 'all':
    default:
      return 'bg-zinc-800 text-zinc-300 border-zinc-700';
  }
}

function statusTone(status: string): string {
  switch (status) {
    case 'completed':
    case 'approved':
      return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20';
    case 'running':
      return 'bg-blue-500/15 text-blue-300 border-blue-500/20';
    case 'needs_approval':
      return 'bg-amber-500/15 text-amber-300 border-amber-500/20';
    case 'denied':
    case 'failed':
    case 'rejected':
    case 'error':
      return 'bg-red-500/15 text-red-300 border-red-500/20';
    default:
      return 'bg-zinc-800 text-zinc-400 border-zinc-700';
  }
}

export function ActivityLogs() {
  const { logs, workspaces, approvals, commandRuns } = useStore();
  const [activeTab, setActiveTab] = useState<LogTab>('system');
  const [activeFilter, setActiveFilter] = useState<LogFilter>('all');

  const getItemSeverity = (item: { kind: string; status: string; type?: string }): LogFilter => {
    if (item.kind === 'log') return item.type as LogFilter;
    if (item.kind === 'approval') {
      if (item.status === 'approved') return 'success';
      if (item.status === 'rejected') return 'error';
      return 'warning';
    }
    if (item.kind === 'command') {
      if (item.status === 'completed') return 'success';
      if (item.status === 'running') return 'info';
      if (item.status === 'needs_approval') return 'warning';
      if (item.status === 'denied' || item.status === 'failed' || item.status === 'error') return 'error';
    }
    return 'info';
  };

  const tabs = useMemo(() => {
    return [
      { id: 'system', label: 'System' },
      ...workspaces.map(ws => ({ id: ws.id, label: ws.name }))
    ];
  }, [workspaces]);

  const workspaceAgents = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const ws of workspaces) {
      map.set(ws.id, new Set(ws.agentIds));
    }
    return map;
  }, [workspaces]);

  const systemItems = useMemo(() => {
    const approvalItems = approvals.map(approval => ({
      id: `approval-${approval.id}`,
      kind: 'approval' as const,
      title: approval.action,
      details: approval.details || 'Approval request',
      timestamp: approval.createdAt,
      status: approval.status,
      source: approval.agentId,
      severity: getItemSeverity({ kind: 'approval', status: approval.status }),
    }));

    const commandItems = commandRuns.map(run => ({
      id: `command-${run.id}`,
      kind: 'command' as const,
      title: `${run.command} ${run.args.join(' ')}`.trim(),
      details: run.cwd ? `cwd: ${run.cwd}` : 'workspace command',
      timestamp: run.startedAt,
      status: run.status,
      source: run.agentId,
      meta: run,
      severity: getItemSeverity({ kind: 'command', status: run.status }),
    }));

    return [...approvalItems, ...commandItems].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
  }, [approvals, commandRuns]);

  const workspaceItems = (workspaceId: string) => {
    const agentIds = workspaceAgents.get(workspaceId) || new Set<string>();
    const logsForWorkspace = logs.filter(log => agentIds.has(log.agentId));
    const approvalsForWorkspace = approvals.filter(approval => agentIds.has(approval.agentId));
    const commandsForWorkspace = commandRuns.filter(run => run.workspaceId === workspaceId || agentIds.has(run.agentId));

    return [
      ...logsForWorkspace.map(log => ({
        id: `log-${log.id}`,
        kind: 'log' as const,
        title: log.action,
        details: log.details,
        timestamp: log.timestamp,
        status: log.type,
        source: log.agentId,
        severity: log.type as LogFilter,
      })),
      ...approvalsForWorkspace.map(approval => ({
        id: `approval-${approval.id}`,
        kind: 'approval' as const,
        title: approval.action,
        details: approval.details || 'Approval request',
        timestamp: approval.createdAt,
        status: approval.status,
        source: approval.agentId,
        severity: getItemSeverity({ kind: 'approval', status: approval.status }),
      })),
      ...commandsForWorkspace.map(run => ({
        id: `command-${run.id}`,
        kind: 'command' as const,
        title: `${run.command} ${run.args.join(' ')}`.trim(),
        details: run.cwd ? `cwd: ${run.cwd}` : 'workspace command',
        timestamp: run.startedAt,
        status: run.status,
        source: run.agentId,
        meta: run,
        severity: getItemSeverity({ kind: 'command', status: run.status }),
      }))
    ].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
  };

  const filterItems = <T extends { severity: LogFilter }>(items: T[]) =>
    activeFilter === 'all' ? items : items.filter(item => item.severity === activeFilter);

  const renderItem = (item: any) => (
    <div key={item.id} className="flex gap-4 p-4 rounded-lg bg-zinc-900 border border-zinc-800">
      <div className={cn(
        "mt-1 h-2 w-2 rounded-full flex-shrink-0",
        item.kind === 'command'
          ? statusTone(item.status)
          : item.status === 'error'
            ? 'bg-red-500'
            : item.status === 'warning'
              ? 'bg-amber-500'
              : item.status === 'success' || item.status === 'approved'
                ? 'bg-emerald-500'
                : 'bg-blue-500'
      )} />
      <div className="flex-1 space-y-1">
        <div className="flex justify-between items-start gap-4">
          <div className="space-y-1">
            <p className="text-sm font-medium">{item.title}</p>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary" className="text-[10px] uppercase tracking-widest">
                {item.kind}
              </Badge>
              <Badge variant="secondary" className={cn("text-[10px] uppercase tracking-widest", statusTone(item.status))}>
                {item.status}
              </Badge>
            </div>
          </div>
          <span className="text-xs text-zinc-500 font-mono">
            {new Date(item.timestamp).toLocaleString()}
          </span>
        </div>
        <p className="text-sm text-zinc-400">{item.details}</p>
        <div className="flex items-center gap-2 mt-2">
          <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">
            Source: {item.source}
          </span>
          {item.kind === 'command' && item.meta?.containerName && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">
              Container: {item.meta.containerName}
            </span>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xs uppercase font-bold tracking-widest text-zinc-500">Activity Logs</h2>
        <p className="text-sm text-zinc-400 mt-1">System activity, command runs, and approvals split by scope.</p>
      </div>

      <Tabs
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      <div className="flex flex-wrap gap-2">
        {FILTERS.map(filter => (
          <button
            key={filter.id}
            type="button"
            onClick={() => setActiveFilter(filter.id)}
            className={cn(
              "px-3 py-1.5 rounded-md border text-xs font-medium transition-colors",
              activeFilter === filter.id
                ? filterTone(filter.id)
                : 'bg-zinc-900 text-zinc-500 border-zinc-800 hover:text-zinc-300 hover:border-zinc-700'
            )}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <TabPanel id="system" activeTab={activeTab}>
        <Card>
          <CardHeader>
            <CardTitle>System Activity</CardTitle>
            <CardDescription>Global approvals and command runs across all workspaces.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {filterItems(systemItems).length > 0 ? filterItems(systemItems).map(renderItem) : (
                <p className="text-sm text-zinc-500">No system activity yet.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </TabPanel>

      {workspaces.map(workspace => (
        <TabPanel key={workspace.id} id={workspace.id} activeTab={activeTab}>
          <Card>
            <CardHeader>
              <CardTitle>{workspace.name}</CardTitle>
              <CardDescription>Logs, approvals, and command runs for this workspace.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {filterItems(workspaceItems(workspace.id)).length > 0 ? filterItems(workspaceItems(workspace.id)).map(renderItem) : (
                  <p className="text-sm text-zinc-500">No activity for this workspace yet.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabPanel>
      ))}
    </div>
  );
}
