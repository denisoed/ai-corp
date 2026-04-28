import { MessageCircle } from 'lucide-react';

interface ChatFABProps {
  onClick: () => void;
  waitingCount: number;
}

export function ChatFAB({ onClick, waitingCount }: ChatFABProps) {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-6 right-6 z-40 w-12 h-12 rounded-full bg-indigo-600 border border-indigo-500 shadow-lg shadow-indigo-500/25 hover:bg-indigo-500 hover:border-indigo-400 hover:shadow-indigo-500/40 text-white flex items-center justify-center transition-all duration-200 active:scale-95"
      title="Agent Chats"
    >
      <MessageCircle size={20} />
      {waitingCount > 0 && (
        <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-amber-500 text-black text-[10px] font-bold flex items-center justify-center leading-none">
          {waitingCount > 9 ? '9+' : waitingCount}
        </span>
      )}
    </button>
  );
}
