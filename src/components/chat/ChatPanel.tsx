import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { Send, X } from 'lucide-react';
import { Agent, Workspace } from '../../types';
import { ChatThread } from '../../store';
import { MessageBubble } from './MessageBubble';
import { cn } from '../../lib/utils';

interface ChatPanelProps {
  visible?: boolean;
  onClose?: () => void;
  threads: ChatThread[];
  agents: Agent[];
  workspaces: Workspace[];
  onSendMessage: (agentId: string, content: string) => Promise<void>;
  mode?: 'modal' | 'page';
}

export function ChatPanel({ visible = true, onClose, threads, agents, workspaces, onSendMessage, mode = 'modal' }: ChatPanelProps) {
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [adminDraft, setAdminDraft] = useState('');
  const [adminSending, setAdminSending] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [selectedChatId]);

  const workspaceThreads = useMemo(() => {
    if (!selectedWorkspaceId) return threads;
    return threads.filter(thread => thread.workspaceId === selectedWorkspaceId);
  }, [selectedWorkspaceId, threads]);

  const selectedAdminThread = useMemo(() => {
    if (!selectedAgentId) return null;
    return threads.find(thread =>
      thread.kind === 'admin-thread' && thread.agents.some(agent => agent?.id === selectedAgentId)
    ) || null;
  }, [selectedAgentId, threads]);

  const workspaceAgents = useMemo(() => {
    if (!selectedWorkspaceId) return agents;
    const ws = workspaces.find(w => w.id === selectedWorkspaceId);
    if (!ws) return [];
    return agents.filter(agent => ws.agentIds.includes(agent.id));
  }, [agents, selectedWorkspaceId, workspaces]);

  const selectedAgent = useMemo(() => {
    if (!selectedAgentId) return null;
    return agents.find(agent => agent.id === selectedAgentId) || null;
  }, [agents, selectedAgentId]);

  const agentThreads = useMemo(() => {
    if (!selectedAgentId) return [];
    return workspaceThreads
      .filter(thread => thread.kind === 'agent-thread' && thread.agents.some(agent => agent?.id === selectedAgentId))
      .sort((a, b) => b.lastMessage.createdAt.localeCompare(a.lastMessage.createdAt));
  }, [selectedAgentId, workspaceThreads]);

  const adminThread = useMemo(() => {
    if (!selectedAgentId) return null;
    return workspaceThreads.find(thread => thread.kind === 'admin-thread' && thread.agents.some(agent => agent?.id === selectedAgentId)) || null;
  }, [selectedAgentId, workspaceThreads]);

  useEffect(() => {
    if (!selectedWorkspaceId && workspaces.length > 0) {
      setSelectedWorkspaceId(workspaces[0].id);
    }
  }, [selectedWorkspaceId, workspaces]);

  useEffect(() => {
    if (selectedWorkspaceId) {
      setSelectedChatId(current => {
        if (current && workspaceThreads.some(thread => thread.chatId === current)) return current;
        return null;
      });
    }
  }, [selectedWorkspaceId, workspaceThreads]);

  useEffect(() => {
    if (selectedAgentId && !workspaceAgents.some(a => a.id === selectedAgentId)) {
      setSelectedAgentId(null);
    }
  }, [selectedAgentId, workspaceAgents]);

  useEffect(() => {
    if (selectedChatId && !workspaceThreads.some(thread => thread.chatId === selectedChatId)) {
      setSelectedChatId(null);
    }
  }, [selectedChatId, workspaceThreads]);

  useEffect(() => {
    if (selectedAgentId && adminThread && !selectedChatId) {
      setSelectedChatId(adminThread.chatId);
    }
  }, [adminThread, selectedAgentId, selectedChatId]);

  const selectedThread = selectedChatId
    ? threads.find(t => t.chatId === selectedChatId) || null
    : null;

  const handleSend = useCallback(async () => {
    if (!selectedAgentId || !draft.trim()) return;
    setSending(true);
    try {
      await onSendMessage(selectedAgentId, draft.trim());
      setDraft('');
    } finally {
      setSending(false);
    }
  }, [draft, onSendMessage, selectedAgentId]);

  const handleAdminSend = useCallback(async () => {
    if (!selectedAgentId || !adminDraft.trim()) return;
    setAdminSending(true);
    try {
      await onSendMessage(selectedAgentId, adminDraft.trim());
      setAdminDraft('');
      setSelectedChatId(adminThread?.chatId || null);
    } finally {
      setAdminSending(false);
    }
  }, [adminDraft, adminThread?.chatId, onSendMessage, selectedAgentId]);

  if (!visible) return null;

  const shellClasses = mode === 'modal'
    ? 'fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in-0 duration-200'
    : 'w-full h-full min-h-0 overflow-hidden';

  const panelClasses = mode === 'modal'
    ? 'relative z-[101] w-full max-w-[1400px] h-[90vh] bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden'
    : 'w-full h-full min-h-0 bg-transparent border-0 rounded-none shadow-none flex flex-col overflow-hidden';

  const headerClasses = mode === 'modal'
    ? 'flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0 bg-zinc-950/90 backdrop-blur'
    : 'flex items-center justify-between px-0 py-0 pb-4 shrink-0';

  return (
    <div className={shellClasses}>
      <div className={panelClasses}>
        <div className={headerClasses}>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-zinc-100">Workspace Chats</div>
            <div className="text-xs text-zinc-500">Select a workspace, then either open a chat or start a direct message.</div>
          </div>
          {mode === 'modal' && onClose ? (
            <button
              onClick={onClose}
              className="text-zinc-500 hover:text-white transition-colors p-1 rounded-md hover:bg-zinc-800"
            >
              <X size={14} />
            </button>
          ) : null}
        </div>

        <div className="flex-1 min-h-0 grid grid-cols-[240px_280px_1fr] overflow-hidden">
          <aside className="border-r border-zinc-800 bg-zinc-950 overflow-y-auto">
            <div className="px-3 py-2 text-[11px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800 sticky top-0 bg-zinc-950">Workspaces</div>
            {workspaces.map(workspace => (
              <button
                key={workspace.id}
                onClick={() => {
                  setSelectedWorkspaceId(workspace.id);
                  setSelectedChatId(null);
                }}
                className={cn(
                  'w-full text-left px-4 py-3 border-b border-zinc-900 hover:bg-zinc-900/80 transition-colors',
                  selectedWorkspaceId === workspace.id && 'bg-zinc-900'
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-zinc-100 truncate">{workspace.name}</span>
                  <span className="text-[10px] text-zinc-500">{workspace.agentIds.length}</span>
                </div>
                <p className="text-xs text-zinc-500 truncate mt-1">{workspace.description}</p>
              </button>
            ))}
          </aside>

          <aside className="border-r border-zinc-800 bg-zinc-950 overflow-y-auto">
            <div className="px-3 py-2 text-[11px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800 sticky top-0 bg-zinc-950">Agents</div>
            {workspaceAgents.length === 0 && (
              <div className="p-4 text-sm text-zinc-500">No agents in this workspace.</div>
            )}
            {workspaceAgents.map(agent => {
              const threadCount = workspaceThreads.filter(thread =>
                thread.agents.some(a => a?.id === agent.id)
              ).length;

              return (
                <button
                  key={agent.id}
                  onClick={() => {
                    setSelectedAgentId(agent.id);
                    setSelectedChatId(null);
                  }}
                  className={cn(
                    'w-full text-left px-4 py-3 border-b border-zinc-900 hover:bg-zinc-900/80 transition-colors',
                    selectedAgentId === agent.id && 'bg-zinc-900'
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-zinc-100 truncate">{agent.name}</span>
                    <span className="text-[10px] text-zinc-500">{threadCount} chats</span>
                  </div>
                  <p className="text-xs text-zinc-500 truncate mt-1">{agent.role || agent.description || 'Agent'}</p>
                </button>
              );
            })}
          </aside>

          <div className="flex flex-col min-h-0 bg-zinc-950 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800 shrink-0">
              <div className="min-w-0">
                <div className="text-sm font-medium text-zinc-100 truncate">
                  {selectedThread
                    ? selectedThread.kind === 'admin-thread'
                      ? `Admin ↔ ${selectedThread.agents.find(a => a?.id !== 'user')?.name || 'Agent'}`
                      : `${selectedThread.agents[0]?.name || 'User'} ↔ ${selectedThread.agents[1]?.name || 'User'}`
                    : selectedAgent
                      ? `${selectedAgent.name}`
                      : 'Select an agent'}
                </div>
                <div className="text-xs text-zinc-500 truncate">
                  {selectedWorkspaceId ? workspaces.find(w => w.id === selectedWorkspaceId)?.name : 'All workspaces'}
                </div>
              </div>
            </div>

            {selectedAgentId ? (
                <div className="flex-1 min-h-0 grid grid-cols-[320px_1fr] overflow-hidden">
                  <div className="border-r border-zinc-800 bg-zinc-950 overflow-y-auto">

                  <div className="px-4 py-3 border-b border-zinc-800">
                    <div className="text-[11px] uppercase tracking-wider text-zinc-500 mb-2">Message as Admin</div>
                    <textarea
                      value={adminDraft}
                      onChange={e => setAdminDraft(e.target.value)}
                      placeholder={`Write to ${selectedAgent?.name || 'agent'}...`}
                      className="w-full min-h-[88px] resize-none bg-zinc-900 border border-zinc-700 text-zinc-100 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-500"
                      disabled={!selectedAgentId || adminSending}
                    />
                    <div className="flex justify-end mt-2">
                      <button
                        onClick={handleAdminSend}
                        disabled={!selectedAgentId || !adminDraft.trim() || adminSending}
                        className="inline-flex items-center gap-2 rounded-xl px-4 py-2 bg-indigo-600 text-white text-sm font-medium disabled:opacity-40"
                      >
                        <Send size={14} />
                        Send as Admin
                      </button>
                    </div>
                  </div>

                  <div className="px-4 py-3 border-b border-zinc-800">
                    <div className="text-[11px] uppercase tracking-wider text-zinc-500 mb-2">Chats with other agents</div>
                    {agentThreads.length === 0 ? (
                      <div className="text-sm text-zinc-500">No agent-to-agent chats for this agent yet.</div>
                    ) : (
                      <div className="space-y-2">
                        {agentThreads.map(thread => {
                          const peer = thread.agents.find(a => a?.id !== selectedAgentId) || thread.agents[0];
                          return (
                            <button
                              key={thread.chatId}
                              onClick={() => setSelectedChatId(thread.chatId)}
                              className={cn(
                                'w-full text-left rounded-xl border px-3 py-2 transition-colors',
                                selectedChatId === thread.chatId
                                  ? 'border-indigo-500 bg-indigo-500/10'
                                  : 'border-zinc-800 bg-zinc-900/40 hover:bg-zinc-900'
                              )}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-sm text-zinc-100 truncate">
                                  {peer?.name || 'Unknown'}
                                </span>
                                <span className="text-[10px] text-zinc-500">{thread.lastMessageTime}</span>
                              </div>
                              <p className="text-xs text-zinc-500 truncate mt-1">
                                {thread.lastMessage.content}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="px-4 py-3">
                    <div className="text-[11px] uppercase tracking-wider text-zinc-500 mb-2">Admin thread</div>
                    {adminThread ? (
                      <button
                        onClick={() => setSelectedChatId(adminThread.chatId)}
                        className={cn(
                          'w-full text-left rounded-xl border px-3 py-2 transition-colors',
                          selectedChatId === adminThread.chatId
                            ? 'border-sky-500 bg-sky-500/10'
                            : 'border-zinc-800 bg-zinc-900/40 hover:bg-zinc-900'
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm text-zinc-100 truncate">Admin conversation</span>
                          <span className="text-[10px] text-zinc-500">{adminThread.lastMessageTime}</span>
                        </div>
                        <p className="text-xs text-zinc-500 truncate mt-1">
                          {adminThread.lastMessage.content}
                        </p>
                      </button>
                    ) : (
                      <div className="text-sm text-zinc-500">No admin conversation yet.</div>
                    )}
                  </div>
                </div>

                  <div className="flex flex-col min-h-0 overflow-hidden">
                  <div ref={chatScrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
                    {selectedThread ? (
                      <div className="max-w-3xl mx-auto flex flex-col gap-4">
                        {selectedThread.messages.flatMap(msg => {
                          const sender = agents.find(a => a.id === msg.fromAgentId);
                          const isAdminMessage = msg.fromAgentId === 'user';
                          const isSelectedAgentMessage = selectedAgentId ? msg.fromAgentId === selectedAgentId : false;
                          const isFromMe = selectedThread.kind === 'admin-thread'
                            ? isAdminMessage
                            : isSelectedAgentMessage;

                          const items = [
                            <MessageBubble
                              key={msg.id}
                              message={msg}
                              senderName={isAdminMessage ? 'You' : (sender?.name || 'Unknown')}
                              isFromMe={isFromMe}
                            />
                          ];

                          if (msg.status === 'replied' && msg.reply) {
                            const replySender = agents.find(a => a.id === msg.toAgentId);
                            const isReplyFromMe = selectedThread.kind === 'admin-thread'
                              ? msg.toAgentId === 'user'
                              : msg.toAgentId === selectedAgentId;

                            items.push(
                              <MessageBubble
                                key={`${msg.id}-reply`}
                                message={{
                                  id: `${msg.id}-reply`,
                                  fromAgentId: msg.toAgentId,
                                  toAgentId: msg.fromAgentId,
                                  content: msg.reply,
                                  status: 'delivered',
                                  createdAt: msg.repliedAt || msg.createdAt,
                                }}
                                senderName={msg.toAgentId === 'user' ? 'You' : (replySender?.name || 'Agent')}
                                isFromMe={isReplyFromMe}
                              />
                            );
                          }

                          return items;
                        })}
                      </div>
                    ) : (
                      <div className="text-sm text-zinc-500">
                        Select a chat on the left to see the conversation.
                      </div>
                    )}
                  </div>

                  {selectedThread && selectedThread.kind === 'agent-thread' && selectedAgentId ? (
                    <div className="border-t border-zinc-800 p-3 shrink-0">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="text-xs text-zinc-500">
                          Replying in chat with {selectedThread.agents.find(a => a?.id !== selectedAgentId)?.name || 'agent'}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <textarea
                          value={draft}
                          onChange={e => setDraft(e.target.value)}
                          placeholder="Type a reply to this agent..."
                          className="flex-1 min-h-[84px] resize-none bg-zinc-900 border border-zinc-700 text-zinc-100 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-500"
                          disabled={!selectedAgentId || sending}
                        />
                        <button
                          onClick={handleSend}
                          disabled={!selectedAgentId || !draft.trim() || sending}
                          className="self-end inline-flex items-center gap-2 rounded-xl px-4 py-3 bg-indigo-600 text-white text-sm font-medium disabled:opacity-40"
                        >
                          <Send size={14} />
                          Send
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="flex-1 min-h-0 flex items-center justify-center px-6 text-zinc-500 text-sm">
                Select an agent to see their conversations and message them as Admin.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
