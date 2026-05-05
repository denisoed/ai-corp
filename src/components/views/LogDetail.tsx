import React, { useState } from 'react';
import { useStore } from '../../store';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { cn } from '../../lib/utils';
import type { Log, LogCategory, LogMetadata } from '../../types';
import { X, Copy, Check, ChevronDown, ChevronRight } from 'lucide-react';

interface LogDetailProps {
  log: Log;
  onClose: () => void;
}

function sourceColor(source?: string): string {
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

function severityColor(type: string): string {
  switch (type) {
    case 'success': return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
    case 'error': return 'bg-red-500/15 text-red-300 border-red-500/30';
    case 'warning': return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
    case 'info': return 'bg-blue-500/15 text-blue-300 border-blue-500/30';
    default: return 'bg-zinc-800 text-zinc-400 border-zinc-700';
  }
}

function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-zinc-800 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 bg-zinc-800/50 hover:bg-zinc-800 text-xs font-medium text-zinc-400"
      >
        {title}
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
      </button>
      {open && <div className="p-3 space-y-1.5">{children}</div>}
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div className="flex justify-between gap-4 py-0.5">
      <span className="text-xs text-zinc-500 flex-shrink-0">{label}</span>
      <span className="text-xs text-zinc-300 text-right break-all">{value}</span>
    </div>
  );
}

function CodeBlock({ content, label }: { content: unknown; label: string }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const str = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
  const preview = str.slice(0, 200);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(str);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (!str) return null;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-zinc-400 hover:text-zinc-200 flex items-center gap-1"
        >
          {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          {label} ({str.length.toLocaleString()} chars)
        </button>
        <button
          type="button"
          onClick={handleCopy}
          className="text-xs text-zinc-500 hover:text-zinc-300"
        >
          {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
        </button>
      </div>
      {expanded && (
        <pre className="text-xs text-zinc-400 bg-zinc-950 rounded p-2 max-h-64 overflow-auto border border-zinc-800 whitespace-pre-wrap">
          {expanded ? str : preview + '...'}
        </pre>
      )}
    </div>
  );
}

function LLLMMeta({ meta }: { meta: LogMetadata }) {
  return (
    <Section title="LLM Call">
      <MetaRow label="Model" value={meta.model} />
      <MetaRow label="Input Tokens" value={meta.inputTokens?.toLocaleString()} />
      <MetaRow label="Output Tokens" value={meta.outputTokens?.toLocaleString()} />
      <MetaRow label="Total Tokens" value={meta.totalTokens?.toLocaleString()} />
      {meta.cachedTokens ? <MetaRow label="Cached Tokens" value={meta.cachedTokens.toLocaleString()} /> : null}
      {meta.reasoningTokens ? <MetaRow label="Reasoning Tokens" value={meta.reasoningTokens.toLocaleString()} /> : null}
      {typeof meta.cost === 'number' ? <MetaRow label="Cost" value={`$${meta.cost.toFixed(6)}`} /> : null}
      <MetaRow label="Function Calls" value={meta.functionCalls?.join(', ')} />
      <CodeBlock content={meta.promptMessages} label="Prompt Messages" />
      <CodeBlock content={meta.responseContent} label="Response" />
    </Section>
  );
}

function ToolMeta({ meta }: { meta: LogMetadata }) {
  return (
    <Section title="Tool Execution">
      <MetaRow label="Tool" value={meta.toolName} />
      <MetaRow label="Agent" value={meta.executingAgentName} />
      <CodeBlock content={meta.toolArgs} label="Arguments" />
      <CodeBlock content={meta.toolResult} label="Result" />
    </Section>
  );
}

function TaskMeta({ meta }: { meta: LogMetadata }) {
  return (
    <Section title="Task">
      <MetaRow label="Task ID" value={meta.taskId} />
      <MetaRow label="Title" value={meta.taskTitle} />
      {meta.fromStatus || meta.toStatus ? (
        <MetaRow label="Status" value={`${meta.fromStatus || '—'} → ${meta.toStatus || '—'}`} />
      ) : null}
      <MetaRow label="Assignee" value={meta.assigneeName} />
      <MetaRow label="Author" value={meta.authorName} />
    </Section>
  );
}

function AgentMeta({ meta }: { meta: LogMetadata }) {
  return (
    <Section title="Agent">
      <MetaRow label="Name" value={meta.targetAgentName} />
      <MetaRow label="Role" value={meta.role} />
      <MetaRow label="Status" value={meta.agentStatus} />
    </Section>
  );
}

function CronMeta({ meta }: { meta: LogMetadata }) {
  return (
    <Section title="Cron Job">
      <MetaRow label="Name" value={meta.cronName} />
      <MetaRow label="Schedule" value={meta.schedule} />
      <MetaRow label="Prompt" value={meta.prompt ? (meta.prompt.length > 200 ? meta.prompt.slice(0, 200) + '...' : meta.prompt) : undefined} />
      <MetaRow label="Result" value={meta.result ? (meta.result.length > 300 ? meta.result.slice(0, 300) + '...' : meta.result) : undefined} />
    </Section>
  );
}

function TelegramMeta({ meta }: { meta: LogMetadata }) {
  return (
    <Section title="Telegram">
      <MetaRow label="Chat ID" value={meta.chatId !== undefined ? String(meta.chatId) : undefined} />
      <MetaRow label="Agent" value={meta.agentName || meta.botName} />
      <MetaRow label="Direction" value={meta.direction} />
      <MetaRow label="Message" value={meta.messageText ? (meta.messageText.length > 500 ? meta.messageText.slice(0, 500) + '...' : meta.messageText) : undefined} />
    </Section>
  );
}

function FileMeta({ meta }: { meta: LogMetadata }) {
  return (
    <Section title="File">
      <MetaRow label="Path" value={meta.filePath} />
      <MetaRow label="Size" value={meta.fileSize ? `${(meta.fileSize / 1024).toFixed(1)} KB` : undefined} />
      <MetaRow label="Operation" value={meta.operation} />
    </Section>
  );
}

function EventMeta({ meta }: { meta: LogMetadata }) {
  return (
    <Section title="Event">
      <MetaRow label="Event Type" value={meta.eventType} />
      <MetaRow label="Label" value={meta.eventLabel} />
      <MetaRow label="Subscribers" value={meta.subscriberCount} />
      <MetaRow label="Channel" value={meta.deliveryChannel} />
      <MetaRow label="Status" value={meta.deliveryStatus} />
    </Section>
  );
}

function ApprovalMeta({ meta }: { meta: LogMetadata }) {
  return (
    <Section title="Approval">
      <MetaRow label="Approval ID" value={meta.approvalId} />
      <MetaRow label="Action" value={meta.action} />
      <MetaRow label="Risk" value={meta.risk} />
      {meta.estimatedCost !== undefined ? <MetaRow label="Est. Cost" value={`$${meta.estimatedCost.toFixed(2)}`} /> : null}
      <MetaRow label="Resolved By" value={meta.resolvedBy} />
    </Section>
  );
}

function MessageMeta({ meta }: { meta: LogMetadata }) {
  return (
    <Section title="Message">
      <MetaRow label="Message ID" value={meta.messageId} />
      <MetaRow label="From" value={meta.senderName} />
      <MetaRow label="To" value={meta.receiverName} />
      <MetaRow label="Channel" value={meta.channel} />
      {meta.isBroadcast ? <MetaRow label="Broadcast" value="Yes" /> : null}
    </Section>
  );
}

function RoleMeta({ meta }: { meta: LogMetadata }) {
  return (
    <Section title="Role / Permission">
      <MetaRow label="Role" value={meta.roleName} />
      <MetaRow label="Permission" value={meta.permission} />
      <MetaRow label="Target Agent" value={meta.targetAgentName} />
    </Section>
  );
}

function WebMeta({ meta }: { meta: LogMetadata }) {
  return (
    <Section title="Web Request">
      {meta.url ? <MetaRow label="URL" value={meta.url} /> : null}
      {meta.query ? <MetaRow label="Query" value={meta.query} /> : null}
      <MetaRow label="Results" value={meta.resultCount} />
      <MetaRow label="Fetched Size" value={meta.fetchedSize ? `${(meta.fetchedSize / 1024).toFixed(1)} KB` : undefined} />
    </Section>
  );
}

function ConnectionMeta({ meta }: { meta: LogMetadata }) {
  return (
    <Section title="Connection">
      <MetaRow label="Type" value={meta.connectionType} />
      <MetaRow label="Agent A" value={meta.agentAName} />
      <MetaRow label="Agent B" value={meta.agentBName} />
    </Section>
  );
}

function SystemMeta({ meta }: { meta: LogMetadata }) {
  return (
    <Section title="System">
      <MetaRow label="Template" value={meta.templateName} />
      <MetaRow label="YML Path" value={meta.ymlPath} />
      <MetaRow label="Agents" value={meta.agentCount} />
    </Section>
  );
}

function renderMetadata(category: LogCategory | undefined, meta: LogMetadata | undefined) {
  if (!meta) return null;
  switch (category) {
    case 'llm': return <LLLMMeta meta={meta} />;
    case 'tool': return <ToolMeta meta={meta} />;
    case 'task': return <TaskMeta meta={meta} />;
    case 'agent': return <AgentMeta meta={meta} />;
    case 'cron': return <CronMeta meta={meta} />;
    case 'telegram': return <TelegramMeta meta={meta} />;
    case 'file': return <FileMeta meta={meta} />;
    case 'event': return <EventMeta meta={meta} />;
    case 'approval': return <ApprovalMeta meta={meta} />;
    case 'message': return <MessageMeta meta={meta} />;
    case 'role': return <RoleMeta meta={meta} />;
    case 'web': return <WebMeta meta={meta} />;
    case 'connection': return <ConnectionMeta meta={meta} />;
    case 'system': return <SystemMeta meta={meta} />;
    default: return null;
  }
}

export function LogDetail({ log, onClose }: LogDetailProps) {
  const { agents, workspaces } = useStore();
  const agent = agents.find(a => a.id === log.agentId);
  const workspace = log.workspaceId ? workspaces.find(w => w.id === log.workspaceId) : undefined;
  const [copied, setCopied] = useState(false);

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(log, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-lg bg-zinc-950 border-l border-zinc-800 z-50 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800 flex-shrink-0">
          <div className="space-y-1 min-w-0 flex-1 mr-4">
            <div className="flex items-center gap-2 flex-wrap">
              {log.category && (
                <Badge variant="secondary" className="text-[10px] uppercase tracking-widest">
                  {log.category}
                </Badge>
              )}
              {log.source && (
                <Badge variant="secondary" className={cn("text-[10px] uppercase tracking-widest", sourceColor(log.source))}>
                  {log.source}
                </Badge>
              )}
              <Badge variant="secondary" className={cn("text-[10px] uppercase tracking-widest", severityColor(log.type))}>
                {log.type}
              </Badge>
            </div>
            <h3 className="text-sm font-medium text-white truncate">{log.action}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex-shrink-0 p-1.5 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Agent Info */}
          {(agent || workspace || log.workspaceId) && (
            <Section title="Source" defaultOpen={true}>
              {agent && (
                <>
                  <MetaRow label="Agent" value={`${agent.name}${agent.role ? ` (${agent.role})` : ''}`} />
                </>
              )}
              {!agent && log.agentId && log.agentId !== 'system' && (
                <MetaRow label="Agent ID" value={log.agentId} />
              )}
              {log.agentId === 'system' && <MetaRow label="Agent" value="System" />}
              <MetaRow label="Workspace" value={workspace?.name || log.workspaceId} />
            </Section>
          )}

          {/* Details */}
          <Section title="Details" defaultOpen={true}>
            <p className="text-xs text-zinc-300 whitespace-pre-wrap">{log.details}</p>
          </Section>

          {/* Timestamp & ID */}
          <Section title="Info" defaultOpen={true}>
            <MetaRow label="Timestamp" value={new Date(log.timestamp).toLocaleString()} />
            <MetaRow label="Log ID" value={log.id} />
          </Section>

          {/* Category-specific Metadata */}
          {log.metadata && renderMetadata(log.category, log.metadata)}

          {/* Raw Metadata (fallback for unknown/partial) */}
          {log.metadata && !log.category && (
            <Section title="Raw Metadata">
              <pre className="text-xs text-zinc-400 max-h-64 overflow-auto whitespace-pre-wrap">
                {JSON.stringify(log.metadata, null, 2)}
              </pre>
            </Section>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-zinc-800 flex-shrink-0">
          <button
            type="button"
            onClick={handleCopyJson}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-300 transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'Copy as JSON'}
          </button>
        </div>
      </div>
    </>
  );
}
