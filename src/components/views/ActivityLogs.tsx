import React, { useMemo, useState } from 'react';
import { useStore } from '../../store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/Card';
import { Tabs, TabPanel } from '../ui/Tabs';
import { Badge } from '../ui/Badge';
import { cn } from '../../lib/utils';
import { LogDetail } from './LogDetail';
import type { Log, LogSource, LogCategory, ApprovalRequest, CommandRun } from '../../types';
import { Search, ChevronDown, Filter } from 'lucide-react';

type LogTab = 'system' | string;
type LogFilter = 'all' | 'info' | 'success' | 'warning' | 'error';
type TimeRange = '1h' | '3h' | '12h' | '24h' | '7d' | '30d' | 'all';

const PAGE_SIZE = 25;

const TIME_RANGES: Array<{ id: TimeRange; label: string }> = [
  { id: '1h', label: '1h' },
  { id: '3h', label: '3h' },
  { id: '12h', label: '12h' },
  { id: '24h', label: '24h' },
  { id: '7d', label: 'Week' },
  { id: '30d', label: 'Month' },
  { id: 'all', label: 'All' },
];

const FILTERS: Array<{ id: LogFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'info', label: 'Info' },
  { id: 'success', label: 'Success' },
  { id: 'warning', label: 'Warning' },
  { id: 'error', label: 'Error' },
];

const SOURCES: Array<{ id: LogSource | 'all'; label: string }> = [
  { id: 'all', label: 'All Sources' },
  { id: 'system', label: 'System' },
  { id: 'llm', label: 'LLM' },
  { id: 'tool', label: 'Tool' },
  { id: 'agent', label: 'Agent' },
  { id: 'cron', label: 'Cron' },
  { id: 'telegram', label: 'Telegram' },
  { id: 'task-autopilot', label: 'Autopilot' },
  { id: 'events', label: 'Events' },
];

const CATEGORIES: Array<{ id: LogCategory | 'all'; label: string }> = [
  { id: 'all', label: 'All Categories' },
  { id: 'llm', label: 'LLM' },
  { id: 'tool', label: 'Tool' },
  { id: 'task', label: 'Task' },
  { id: 'agent', label: 'Agent' },
  { id: 'cron', label: 'Cron' },
  { id: 'telegram', label: 'Telegram' },
  { id: 'file', label: 'File' },
  { id: 'event', label: 'Event' },
  { id: 'approval', label: 'Approval' },
  { id: 'message', label: 'Message' },
  { id: 'role', label: 'Role' },
  { id: 'web', label: 'Web' },
  { id: 'connection', label: 'Connection' },
  { id: 'system', label: 'System' },
];

function severityColor(type: string): string {
  switch (type) {
    case 'success': return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
    case 'error': return 'bg-red-500/15 text-red-300 border-red-500/30';
    case 'warning': return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
    case 'info': return 'bg-blue-500/15 text-blue-300 border-blue-500/30';
    default: return 'bg-zinc-800 text-zinc-400 border-zinc-700';
  }
}

function sourceBadgeColor(source?: string): string {
  const colors: Record<string, string> = {
    system: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',
    agent: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
    cron: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    telegram: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
    'task-autopilot': 'bg-violet-500/15 text-violet-300 border-violet-500/30',
    events: 'bg-green-500/15 text-green-300 border-green-500/30',
    tool: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
    llm: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30',
  };
  return colors[source || ''] || 'bg-zinc-800 text-zinc-400 border-zinc-700';
}

function dotColor(type: string): string {
  switch (type) {
    case 'success': return 'bg-emerald-500';
    case 'error': return 'bg-red-500';
    case 'warning': return 'bg-amber-500';
    case 'info': return 'bg-blue-500';
    default: return 'bg-zinc-600';
  }
}

function filterTone(filter: LogFilter): string {
  switch (filter) {
    case 'info': return 'bg-blue-500/15 text-blue-300 border-blue-500/30';
    case 'success': return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
    case 'warning': return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
    case 'error': return 'bg-red-500/15 text-red-300 border-red-500/30';
    default: return 'bg-zinc-800 text-zinc-300 border-zinc-700';
  }
}

function statusTone(status: string): string {
  switch (status) {
    case 'completed': case 'approved': return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20';
    case 'running': return 'bg-blue-500/15 text-blue-300 border-blue-500/20';
    case 'needs_approval': return 'bg-amber-500/15 text-amber-300 border-amber-500/20';
    case 'denied': case 'failed': case 'rejected': case 'error': return 'bg-red-500/15 text-red-300 border-red-500/20';
    default: return 'bg-zinc-800 text-zinc-400 border-zinc-700';
  }
}

interface UnifiedItem {
  id: string;
  kind: 'log' | 'approval' | 'command';
  title: string;
  details: string;
  timestamp: string;
  source: string;
  severity: LogFilter;
  status: string;
  log?: Log;
  approval?: ApprovalRequest;
  command?: CommandRun;
}

export function ActivityLogs() {
  const { logs, workspaces, approvals, commandRuns, agents } = useStore();
  const [activeTab, setActiveTab] = useState<LogTab>('system');
  const [activeFilter, setActiveFilter] = useState<LogFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<LogSource | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<LogCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selectedItem, setSelectedItem] = useState<UnifiedItem | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [timeRange, setTimeRange] = useState<TimeRange>('all');

  const agentMap = useMemo(() => {
    const map = new Map<string, typeof agents[0]>();
    for (const a of agents) map.set(a.id, a);
    return map;
  }, [agents]);

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

  const getItemSeverity = (item: UnifiedItem): LogFilter => {
    if (item.kind === 'log') return item.log?.type as LogFilter || 'info';
    if (item.kind === 'approval') {
      if (item.approval?.status === 'approved') return 'success';
      if (item.approval?.status === 'rejected') return 'error';
      return 'warning';
    }
    if (item.kind === 'command') {
      const s = item.command?.status;
      if (s === 'completed') return 'success';
      if (s === 'running') return 'info';
      if (s === 'needs_approval') return 'warning';
      if (s === 'denied' || s === 'failed' || s === 'error') return 'error';
    }
    return 'info';
  };

  const systemItems: UnifiedItem[] = useMemo(() => {
    const logItems: UnifiedItem[] = logs.map(log => ({
      id: `log-${log.id}`,
      kind: 'log',
      title: log.action,
      details: log.details,
      timestamp: log.timestamp,
      source: log.agentId,
      severity: log.type as LogFilter,
      status: log.type,
      log,
    }));

    const approvalItems: UnifiedItem[] = approvals.map(approval => ({
      id: `approval-${approval.id}`,
      kind: 'approval',
      title: approval.action,
      details: approval.details || 'Approval request',
      timestamp: approval.createdAt,
      source: approval.agentId,
      severity: getItemSeverity({ kind: 'approval', title: '', details: '', timestamp: '', source: '', severity: 'info', status: approval.status, approval, id: '' }),
      status: approval.status,
      approval,
    }));

    const commandItems: UnifiedItem[] = commandRuns.map(run => ({
      id: `command-${run.id}`,
      kind: 'command',
      title: `${run.command} ${run.args.join(' ')}`.trim(),
      details: run.cwd ? `cwd: ${run.cwd}` : 'workspace command',
      timestamp: run.startedAt,
      source: run.agentId,
      severity: getItemSeverity({ kind: 'command', title: '', details: '', timestamp: '', source: '', severity: 'info', status: run.status, command: run, id: '' }),
      status: run.status,
      command: run,
    }));

    return [...logItems, ...approvalItems, ...commandItems].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
  }, [logs, approvals, commandRuns]);

  const workspaceItems = (workspaceId: string): UnifiedItem[] => {
    const agentIds = workspaceAgents.get(workspaceId) || new Set<string>();
    const logsForWorkspace = logs.filter(log => agentIds.has(log.agentId) || log.workspaceId === workspaceId);
    const approvalsForWorkspace = approvals.filter(approval => agentIds.has(approval.agentId));
    const commandsForWorkspace = commandRuns.filter(run => run.workspaceId === workspaceId || agentIds.has(run.agentId));

    const items: UnifiedItem[] = [
      ...logsForWorkspace.map(log => ({
        id: `log-${log.id}`,
        kind: 'log' as const,
        title: log.action,
        details: log.details,
        timestamp: log.timestamp,
        source: log.agentId,
        severity: log.type as LogFilter,
        status: log.type,
        log,
      })),
      ...approvalsForWorkspace.map(approval => ({
        id: `approval-${approval.id}`,
        kind: 'approval' as const,
        title: approval.action,
        details: approval.details || 'Approval request',
        timestamp: approval.createdAt,
        source: approval.agentId,
        severity: getItemSeverity({ kind: 'approval', title: '', details: '', timestamp: '', source: '', severity: 'info', status: approval.status, approval, id: '' }),
        status: approval.status,
        approval,
      })),
      ...commandsForWorkspace.map(run => ({
        id: `command-${run.id}`,
        kind: 'command' as const,
        title: `${run.command} ${run.args.join(' ')}`.trim(),
        details: run.cwd ? `cwd: ${run.cwd}` : 'workspace command',
        timestamp: run.startedAt,
        source: run.agentId,
        severity: getItemSeverity({ kind: 'command', title: '', details: '', timestamp: '', source: '', severity: 'info', status: run.status, command: run, id: '' }),
        status: run.status,
        command: run,
      }))
    ].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));

    return items;
  };

  const filterItems = (items: UnifiedItem[]) => {
    let filtered = items;

    if (activeFilter !== 'all') {
      filtered = filtered.filter(item => item.severity === activeFilter);
    }

    if (sourceFilter !== 'all') {
      filtered = filtered.filter(item => {
        if (item.kind === 'log' && item.log) return item.log.source === sourceFilter;
        if (item.kind === 'log' && !item.log?.source) return false;
        return false;
      });
    }

    if (categoryFilter !== 'all') {
      filtered = filtered.filter(item => {
        if (item.kind === 'log' && item.log) return item.log.category === categoryFilter;
        return false;
      });
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(item =>
        item.title.toLowerCase().includes(q) ||
        item.details.toLowerCase().includes(q) ||
        (item.log?.metadata?.agentName as string)?.toLowerCase().includes(q) ||
        item.source.toLowerCase().includes(q)
      );
    }

    if (timeRange !== 'all') {
      const now = Date.now();
      const ranges: Record<TimeRange, number> = {
        '1h': 60 * 60 * 1000,
        '3h': 3 * 60 * 60 * 1000,
        '12h': 12 * 60 * 60 * 1000,
        '24h': 24 * 60 * 60 * 1000,
        '7d': 7 * 24 * 60 * 60 * 1000,
        '30d': 30 * 24 * 60 * 60 * 1000,
        'all': 0,
      };
      const cutoff = now - ranges[timeRange];
      filtered = filtered.filter(item => Date.parse(item.timestamp) >= cutoff);
    }

    return filtered;
  };

  const getVisibleItems = (items: UnifiedItem[]) => {
    return items.slice(0, visibleCount);
  };

  const renderSourceBadge = (item: UnifiedItem) => {
    if (item.kind === 'log' && item.log) {
      const logSource = item.log.source;
      const sourceAgent = agentMap.get(item.log.agentId);
      return (
        <>
          {logSource && (
            <span className={cn("text-[9px] px-1.5 py-0.5 rounded-full font-medium uppercase tracking-wider border", sourceBadgeColor(logSource))}>
              {logSource}
            </span>
          )}
          {item.log.category && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full font-medium uppercase tracking-wider border bg-zinc-800 text-zinc-400 border-zinc-700">
              {item.log.category}
            </span>
          )}
          <span className="text-[10px] text-zinc-500">
            {sourceAgent?.name || (item.log.agentId === 'system' ? 'System' : item.log.agentId?.slice(0, 8) || '—')}
          </span>
        </>
      );
    }
    const sourceAgent = agentMap.get(item.source);
    return (
      <span className="text-[10px] text-zinc-500">
        {sourceAgent?.name || item.source}
      </span>
    );
  };

  const renderItem = (item: UnifiedItem) => (
    <div
      key={item.id}
      onClick={() => {
        if (item.kind === 'log' && item.log) {
          setSelectedItem(item);
        }
      }}
      className={cn(
        "flex gap-3 p-3 rounded-lg bg-zinc-900 border border-zinc-800 transition-colors",
        item.kind === 'log' && item.log && "hover:border-zinc-700 hover:bg-zinc-800/50 cursor-pointer"
      )}
    >
      <div className={cn("mt-0.5 h-2 w-2 rounded-full flex-shrink-0", dotColor(item.severity))} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-3 mb-1">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <span className="text-xs font-medium text-zinc-200 truncate">{item.title}</span>
          </div>
          <span className="text-[10px] text-zinc-600 font-mono flex-shrink-0">
            {new Date(item.timestamp).toLocaleString()}
          </span>
        </div>
        <p className="text-[11px] text-zinc-500 truncate mb-1.5">{item.details}</p>
        <div className="flex items-center gap-2 flex-wrap">
          {renderSourceBadge(item)}
          {item.kind !== 'log' && (
            <Badge variant="secondary" className="text-[9px] uppercase tracking-widest">
              {item.kind}
            </Badge>
          )}
          {item.status && item.kind !== 'log' && (
            <Badge variant="secondary" className={cn("text-[9px] uppercase tracking-widest", statusTone(item.status))}>
              {item.status}
            </Badge>
          )}
          {item.kind === 'command' && item.command?.containerName && (
            <span className="text-[10px] text-zinc-600">
              container: {item.command.containerName}
            </span>
          )}
        </div>
      </div>
    </div>
  );

  const currentItems = activeTab === 'system' ? systemItems : workspaceItems(activeTab);
  const filteredItems = filterItems(currentItems);
  const visibleItems = getVisibleItems(filteredItems);
  const hasMore = visibleItems.length < filteredItems.length;

  const handleLoadMore = () => {
    setVisibleCount(prev => prev + PAGE_SIZE);
  };

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    setVisibleCount(PAGE_SIZE);
    setSearchQuery('');
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xs uppercase font-bold tracking-widest text-zinc-500">Activity Logs</h2>
        <p className="text-xs text-zinc-500 mt-1">System activity, LLM calls, tool executions, and events. Click a log entry for full details.</p>
      </div>

      <Tabs tabs={tabs} activeTab={activeTab} onTabChange={handleTabChange} />

      {/* Search + Filters */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
            <input
              type="text"
              placeholder="Search logs..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setVisibleCount(PAGE_SIZE); }}
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md bg-zinc-900 border border-zinc-800 text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-zinc-700"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors",
              showFilters ? 'border-indigo-500/30 text-indigo-400 bg-indigo-500/10' : 'border-zinc-800 text-zinc-500 hover:text-zinc-300'
            )}
          >
            <Filter className="w-3 h-3" />
            Filters
            <ChevronDown className={cn("w-3 h-3 transition-transform", showFilters && "rotate-180")} />
          </button>
        </div>

        {/* Advanced filters (collapsible) */}
        {showFilters && (
          <div className="space-y-3 p-3 rounded-lg bg-zinc-900 border border-zinc-800">
            <div>
              <p className="text-[10px] text-zinc-500 font-medium mb-1.5">Time Range</p>
              <div className="flex flex-wrap gap-1">
                {TIME_RANGES.map(tr => (
                  <button
                    key={tr.id}
                    type="button"
                    onClick={() => { setTimeRange(tr.id); setVisibleCount(PAGE_SIZE); }}
                    className={cn(
                      "px-2 py-0.5 rounded-md border text-[10px] font-medium transition-colors",
                      timeRange === tr.id
                        ? 'border-indigo-500/30 text-indigo-300 bg-indigo-500/10'
                        : 'bg-zinc-950 text-zinc-600 border-zinc-800 hover:text-zinc-400'
                    )}
                  >
                    {tr.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[10px] text-zinc-500 font-medium mb-1.5">Severity</p>
              <div className="flex flex-wrap gap-1">
                {FILTERS.map(filter => (
                  <button
                    key={filter.id}
                    type="button"
                    onClick={() => { setActiveFilter(filter.id); setVisibleCount(PAGE_SIZE); }}
                    className={cn(
                      "px-2 py-0.5 rounded-md border text-[10px] font-medium transition-colors",
                      activeFilter === filter.id
                        ? filterTone(filter.id)
                        : 'bg-zinc-950 text-zinc-600 border-zinc-800 hover:text-zinc-400'
                    )}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[10px] text-zinc-500 font-medium mb-1.5">Source</p>
              <div className="flex flex-wrap gap-1">
                {SOURCES.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => { setSourceFilter(s.id); setVisibleCount(PAGE_SIZE); }}
                    className={cn(
                      "px-2 py-0.5 rounded-md border text-[10px] font-medium transition-colors",
                      sourceFilter === s.id
                        ? s.id === 'all' ? 'border-zinc-600 text-zinc-200 bg-zinc-800' : sourceBadgeColor(s.id)
                        : 'bg-zinc-950 text-zinc-600 border-zinc-800 hover:text-zinc-400'
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[10px] text-zinc-500 font-medium mb-1.5">Category</p>
              <div className="flex flex-wrap gap-1">
                {CATEGORIES.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => { setCategoryFilter(c.id); setVisibleCount(PAGE_SIZE); }}
                    className={cn(
                      "px-2 py-0.5 rounded-md border text-[10px] font-medium transition-colors",
                      categoryFilter === c.id
                        ? c.id === 'all' ? 'border-zinc-600 text-zinc-200 bg-zinc-800' : 'border-zinc-600 text-zinc-300 bg-zinc-800'
                        : 'bg-zinc-950 text-zinc-600 border-zinc-800 hover:text-zinc-400'
                    )}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Tab content */}
      <TabPanel id="system" activeTab={activeTab}>
        <Card>
          <CardHeader>
            <CardTitle>System Activity</CardTitle>
            <CardDescription>
              All logs, approvals, and command runs across the system.
              {filteredItems.length > visibleItems.length && ` Showing ${visibleItems.length} of ${filteredItems.length}.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {visibleItems.length > 0 ? (
                <>
                  {visibleItems.map(renderItem)}
                  {hasMore && (
                    <button
                      type="button"
                      onClick={handleLoadMore}
                      className="w-full py-2 text-xs text-zinc-500 hover:text-zinc-300 border border-zinc-800 rounded-lg hover:bg-zinc-800/50 transition-colors"
                    >
                      Load More ({Math.min(PAGE_SIZE, filteredItems.length - visibleItems.length)} of {filteredItems.length - visibleItems.length} remaining)
                    </button>
                  )}
                </>
              ) : (
                <p className="text-sm text-zinc-500">No matching activity found.</p>
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
              <CardDescription>
                Logs, approvals, and command runs for this workspace.
                {(() => { const wsItems = filterItems(workspaceItems(workspace.id)); return wsItems.length > visibleCount ? ` Showing ${Math.min(visibleCount, wsItems.length)} of ${wsItems.length}.` : null; })()}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {visibleItems.length > 0 ? (
                  <>
                    {visibleItems.map(renderItem)}
                    {hasMore && (
                      <button
                        type="button"
                        onClick={handleLoadMore}
                        className="w-full py-2 text-xs text-zinc-500 hover:text-zinc-300 border border-zinc-800 rounded-lg hover:bg-zinc-800/50 transition-colors"
                      >
                        Load More ({Math.min(PAGE_SIZE, filteredItems.length - visibleItems.length)} of {filteredItems.length - visibleItems.length} remaining)
                      </button>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-zinc-500">No matching activity found.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabPanel>
      ))}

      {/* Detail Panel */}
      {selectedItem?.log && (
        <LogDetail
          log={selectedItem.log}
          onClose={() => setSelectedItem(null)}
        />
      )}
    </div>
  );
}
