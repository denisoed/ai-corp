import { useState, useCallback } from 'react';
import { X } from 'lucide-react';
import { ChatThread } from '../../store';
import { ChatListView } from './ChatListView';
import { ChatConversation } from './ChatConversation';

interface ChatPanelProps {
  visible: boolean;
  onClose: () => void;
  threads: ChatThread[];
}

export function ChatPanel({ visible, onClose, threads }: ChatPanelProps) {
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);

  const selectedThread = selectedChatId
    ? threads.find(t => t.chatId === selectedChatId) || null
    : null;

  const handleBack = useCallback(() => {
    setSelectedChatId(null);
  }, []);

  const handleClose = useCallback(() => {
    setSelectedChatId(null);
    onClose();
  }, [onClose]);

  if (!visible) return null;

  return (
    <div className="fixed bottom-20 right-6 z-40 w-[420px] h-[600px] bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 duration-200">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0">
        <span className="text-sm font-semibold text-zinc-100">
          {selectedThread ? 'Conversation' : 'Agent Chats'}
        </span>
        <button
          onClick={handleClose}
          className="text-zinc-500 hover:text-white transition-colors p-1 rounded-md hover:bg-zinc-800"
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 min-h-0">
        {selectedThread ? (
          <ChatConversation
            thread={selectedThread}
            onBack={handleBack}
          />
        ) : (
          <ChatListView
            threads={threads}
            onSelectChat={setSelectedChatId}
          />
        )}
      </div>
    </div>
  );
}
