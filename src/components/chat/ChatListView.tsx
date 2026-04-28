import { useMemo } from 'react';
import { ChatThread } from '../../store';
import { stripMarkdown } from '../../lib/markdown';

interface ChatListViewProps {
  threads: ChatThread[];
  onSelectChat: (chatId: string) => void;
}

const WORKSPACE_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f97316', '#14b8a6', '#22c55e', '#3b82f6', '#eab308'
];

export function ChatListView({ threads, onSelectChat }: ChatListViewProps) {
  const grouped = useMemo(() => {
    const map = new Map<string, { workspaceId: string; workspaceName: string; threads: ChatThread[] }>();

    for (const thread of threads) {
      const key = thread.workspaceId;
      if (!map.has(key)) {
        map.set(key, {
          workspaceId: thread.workspaceId,
          workspaceName: thread.workspaceName,
          threads: [],
        });
      }
      map.get(key)!.threads.push(thread);
    }

    return Array.from(map.values());
  }, [threads]);

  const colorIndex = (idx: number) => WORKSPACE_COLORS[idx % WORKSPACE_COLORS.length];

  return (
    <div className="flex flex-col h-full">
      <div className="overflow-y-auto flex-1">
        {grouped.length === 0 && (
          <div className="text-center text-zinc-500 text-sm py-12 px-4">
            No agent conversations yet. Agents will start chatting once they use send_message or ask_agent tools.
          </div>
        )}

        {grouped.map((group, gi) => (
          <div key={group.workspaceId}>
            <div
              className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-2 sticky top-0 bg-zinc-900/95 backdrop-blur-sm z-10 border-b border-zinc-800/50"
              style={{ borderLeftColor: colorIndex(gi), borderLeftWidth: 3 }}
            >
              <span>{group.workspaceName}</span>
              <span className="text-zinc-600 font-normal">{group.threads.length}</span>
            </div>

            {group.threads.map((thread) => (
              <button
                key={thread.chatId}
                onClick={() => onSelectChat(thread.chatId)}
                className="w-full text-left px-4 py-3 hover:bg-zinc-800/50 transition-colors border-b border-zinc-800/30 flex items-start gap-3"
              >
                <div className="flex items-center mt-0.5 shrink-0">
                  <div className="w-4 h-4 rounded-full bg-indigo-500/30 flex items-center justify-center text-[8px] text-indigo-300 font-bold">
                    {thread.agents[0].name.charAt(0)}
                  </div>
                  <div className="w-3 h-px bg-zinc-600" />
                  <div className="w-4 h-4 rounded-full bg-emerald-500/30 flex items-center justify-center text-[8px] text-emerald-300 font-bold">
                    {thread.agents[1].name.charAt(0)}
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-zinc-200 truncate">
                      {thread.agents[0].name} ↔ {thread.agents[1].name}
                    </span>
                    <span className="text-[10px] text-zinc-500 shrink-0">{thread.lastMessageTime}</span>
                  </div>
                  <p className="text-xs text-zinc-500 truncate mt-0.5">
                    {stripMarkdown(thread.lastMessage.content).slice(0, 80)}
                  </p>
                </div>

                <div className="shrink-0 self-center">
                  {thread.waitingReply ? (
                    <span className="w-2 h-2 rounded-full bg-amber-400 block" title="Waiting for reply" />
                  ) : thread.lastMessage.status === 'replied' ? (
                    <span className="w-2 h-2 rounded-full bg-emerald-400 block" title="Replied" />
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-zinc-600 block" title="Delivered" />
                  )}
                </div>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
