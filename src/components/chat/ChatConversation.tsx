import { useEffect, useRef } from 'react';
import { ArrowLeft } from 'lucide-react';
import { ChatThread } from '../../store';
import { MessageBubble } from './MessageBubble';

interface ChatConversationProps {
  thread: ChatThread;
  onBack: () => void;
}

export function ChatConversation({ thread, onBack }: ChatConversationProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [thread.messages.length]);

  const [agentA, agentB] = thread.agents;

  function getSenderName(fromId: string): string {
    if (fromId === agentA.id) return agentA.name;
    if (fromId === agentB.id) return agentB.name;
    return 'Unknown';
  }

  const connectionLabel = `${agentA.name} ↔ ${agentB.name}`;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center px-4 py-3 border-b border-zinc-800 shrink-0">
        <button
          onClick={onBack}
          className="text-zinc-400 hover:text-white transition-colors p-1 -ml-1 rounded-md hover:bg-zinc-800"
        >
          <ArrowLeft size={16} />
        </button>
        <span className="text-sm font-medium text-zinc-200 truncate ml-1">{connectionLabel}</span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {thread.messages.map((msg) => (
          <div key={msg.id}>
            <MessageBubble
              message={msg}
              senderName={getSenderName(msg.fromAgentId)}
              isFromMe={false}
            />
          </div>
        ))}

        {thread.messages.length === 0 && (
          <div className="text-center text-zinc-500 text-sm py-12">
            No messages in this conversation.
          </div>
        )}
      </div>
    </div>
  );
}
