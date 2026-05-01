import React, { useMemo, useState } from 'react';
import { Plus, Bell, BellOff, Trash2, Settings2, Users } from 'lucide-react';
import { useStore } from '../../store';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Badge } from '../ui/Badge';
import { CustomSelect, SelectItem } from '../ui/CustomSelect';
import { cn } from '../../lib/utils';
import type { DomainEventType, EventSubscription, SubscriptionChannel } from '../../types';

export function EventsManagement() {
  const { agents, workspaces, subscriptions, eventDefinitions, createSubscription, updateSubscription, deleteSubscription } = useStore();
  const [workspaceFilter, setWorkspaceFilter] = useState('');
  const [agentFilter, setAgentFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newAgentId, setNewAgentId] = useState('');
  const [newEventType, setNewEventType] = useState<DomainEventType | ''>('');
  const [newChannel, setNewChannel] = useState<SubscriptionChannel>('telegram');
  const [newInstructions, setNewInstructions] = useState('');
  const [newTaskId, setNewTaskId] = useState('');
  const [newToStatus, setNewToStatus] = useState('');
  const [newFromStatus, setNewFromStatus] = useState('');
  const [showHelp, setShowHelp] = useState(false);

  const filteredAgents = useMemo(() => {
    return agents.filter(agent => {
      if (workspaceFilter && agent.workspaceId !== workspaceFilter) return false;
      if (agentFilter && agent.id !== agentFilter) return false;
      return true;
    });
  }, [agents, workspaceFilter, agentFilter]);

  const submitCreate = async () => {
    if (!newAgentId || !newEventType) return;
    await createSubscription({
      agentId: newAgentId,
      eventType: newEventType,
      channel: newChannel,
      enabled: true,
      instructions: newInstructions || undefined,
      filters: {
        taskId: newTaskId || undefined,
        fromStatus: newFromStatus as any || undefined,
        toStatus: newToStatus as any || undefined,
      },
    });
    setShowCreate(false);
    setNewAgentId('');
    setNewEventType('');
    setNewChannel('telegram');
    setNewInstructions('');
    setNewTaskId('');
    setNewFromStatus('');
    setNewToStatus('');
  };

  const agentSubscriptions = (agentId: string) => subscriptions.filter(sub => sub.agentId === agentId);

  return (
    <div className="h-full flex flex-col space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-zinc-800 pb-4">
        <div>
          <h2 className="text-xs uppercase font-bold tracking-widest text-zinc-500">Events</h2>
          <p className="text-sm text-zinc-400 mt-1">Manage event subscriptions for agents and create new watchers.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowHelp(true)}>
            <Settings2 className="mr-1.5 h-4 w-4" />
            Help
          </Button>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Subscription
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 flex-1 overflow-hidden">
        <div className="space-y-4 overflow-y-auto pr-1">
          <h3 className="text-sm font-semibold text-zinc-300 flex items-center gap-2 sticky top-0 bg-zinc-950 py-2 z-10">
            <Users size={16} className="text-indigo-400" />
            Agents
            <Badge className="ml-1">{filteredAgents.length}</Badge>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <CustomSelect value={workspaceFilter || '__all__'} onValueChange={(v) => setWorkspaceFilter(v === '__all__' ? '' : v)}>
              <SelectItem value="__all__">All workspaces</SelectItem>
              {workspaces.map(ws => <SelectItem key={ws.id} value={ws.id}>{ws.name}</SelectItem>)}
            </CustomSelect>
            <CustomSelect value={agentFilter || '__all__'} onValueChange={(v) => setAgentFilter(v === '__all__' ? '' : v)}>
              <SelectItem value="__all__">All agents</SelectItem>
              {filteredAgents.map(agent => <SelectItem key={agent.id} value={agent.id}>{agent.name}</SelectItem>)}
            </CustomSelect>
          </div>

          {filteredAgents.map(agent => {
            const subs = agentSubscriptions(agent.id);
            return (
              <div key={agent.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-zinc-100">{agent.name}</div>
                    <div className="text-xs text-zinc-500">{workspaces.find(ws => ws.id === agent.workspaceId)?.name || 'No workspace'}</div>
                  </div>
                  <Badge>{subs.length} subscriptions</Badge>
                </div>

                <div className="space-y-2">
                  {subs.length === 0 && <div className="text-xs text-zinc-500">No subscriptions yet.</div>}
                  {subs.map(sub => (
                    <div key={sub.id} className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className={cn("text-xs px-2 py-0.5 rounded border", sub.enabled ? "border-emerald-500/20 text-emerald-300 bg-emerald-500/10" : "border-zinc-700 text-zinc-500 bg-zinc-800/50")}>
                            {sub.enabled ? <Bell className="inline mr-1 h-3 w-3" /> : <BellOff className="inline mr-1 h-3 w-3" />}
                            {sub.eventType}
                          </span>
                          <span className="text-[10px] text-zinc-500">{sub.channel}</span>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="ghost" size="sm" onClick={() => updateSubscription(sub.id, { enabled: !sub.enabled })}>
                            {sub.enabled ? 'Disable' : 'Enable'}
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => deleteSubscription(sub.id)}>
                            <Trash2 className="h-4 w-4 text-red-400" />
                          </Button>
                        </div>
                      </div>
                      <div className="text-xs text-zinc-500">
                        {sub.instructions || 'No custom instructions.'}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {sub.filters.taskId && <Badge variant="secondary">task: {sub.filters.taskId}</Badge>}
                        {sub.filters.fromStatus && <Badge variant="secondary">from: {sub.filters.fromStatus}</Badge>}
                        {sub.filters.toStatus && <Badge variant="secondary">to: {sub.filters.toStatus}</Badge>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="space-y-4 overflow-y-auto pr-1">
          <h3 className="text-sm font-semibold text-zinc-300 flex items-center gap-2 sticky top-0 bg-zinc-950 py-2 z-10">
            <Settings2 size={16} className="text-purple-400" />
            Event Definitions
          </h3>

          {eventDefinitions.map(def => (
            <div key={def.type} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
              <div className="flex items-center gap-2">
                <div className="text-sm font-semibold text-zinc-100">{def.label}</div>
                <code className="text-[10px] text-zinc-500 font-mono bg-zinc-950 px-1.5 py-0.5 rounded">{def.type}</code>
              </div>
              <p className="text-xs text-zinc-400 mt-2">{def.description}</p>
            </div>
          ))}
        </div>
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="absolute inset-0" onClick={() => setShowCreate(false)} />
          <div className="relative w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-zinc-800">
              <h3 className="text-lg font-semibold text-zinc-100">Create Subscription</h3>
              <p className="text-sm text-zinc-500 mt-1">Bind an agent to a system event with optional filters.</p>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto">
              <CustomSelect value={newAgentId || '__select__'} onValueChange={setNewAgentId} placeholder="Select agent...">
                <SelectItem value="__select__" disabled>Select agent...</SelectItem>
                {agents.map(agent => <SelectItem key={agent.id} value={agent.id}>{agent.name}</SelectItem>)}
              </CustomSelect>
              <CustomSelect value={newEventType || '__select__'} onValueChange={(v) => setNewEventType(v === '__select__' ? '' : v as DomainEventType)} placeholder="Select event...">
                <SelectItem value="__select__" disabled>Select event...</SelectItem>
                {eventDefinitions.map(def => <SelectItem key={def.type} value={def.type}>{def.label}</SelectItem>)}
              </CustomSelect>
              <CustomSelect value={newChannel} onValueChange={(v) => setNewChannel(v as SubscriptionChannel)} placeholder="Channel">
                <SelectItem value="telegram">Telegram</SelectItem>
                <SelectItem value="in_app">In-app</SelectItem>
              </CustomSelect>
              <Input value={newTaskId} onChange={e => setNewTaskId(e.target.value)} placeholder="Optional task id filter" />
              <Input value={newFromStatus} onChange={e => setNewFromStatus(e.target.value)} placeholder="Optional from status filter" />
              <Input value={newToStatus} onChange={e => setNewToStatus(e.target.value)} placeholder="Optional to status filter" />
              <Input value={newInstructions} onChange={e => setNewInstructions(e.target.value)} placeholder="Optional instructions" />
            </div>
            <div className="p-6 border-t border-zinc-800 flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button onClick={submitCreate} disabled={!newAgentId || !newEventType}>Create</Button>
            </div>
          </div>
        </div>
      )}

      {showHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="absolute inset-0" onClick={() => setShowHelp(false)} />
          <div className="relative w-full max-w-xl bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="p-6 border-b border-zinc-800 sticky top-0 bg-zinc-950 z-10">
              <h3 className="text-lg font-semibold text-zinc-100">Events Help</h3>
              <p className="text-sm text-zinc-500 mt-1">Event subscriptions let agents react when something changes in the system.</p>
            </div>
            <div className="p-6 space-y-3 text-sm text-zinc-400">
              <p>Use subscriptions to notify or trigger follow-up behavior when tasks change status, get comments, or change assignee.</p>
              <p>Filters narrow the event to one task or one status transition. Instructions are passed to the agent as context for the notification text.</p>
            </div>
            <div className="p-6 border-t border-zinc-800 flex justify-end bg-zinc-950 sticky bottom-0">
              <Button onClick={() => setShowHelp(false)}>Got it</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
