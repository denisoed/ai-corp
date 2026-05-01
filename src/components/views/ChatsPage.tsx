import { useStore } from '../../store';
import { useAgentChats } from '../../store';
import { ChatPanel } from '../chat/ChatPanel';

export function ChatsPage() {
  const agents = useStore(s => s.agents);
  const workspaces = useStore(s => s.workspaces);
  const sendMessageToAgent = useStore(s => s.sendMessageToAgent);
  const chatThreads = useAgentChats();

  return (
    <div className="flex-1 min-h-0 overflow-hidden">
      <ChatPanel
        mode="page"
        threads={chatThreads}
        agents={agents}
        workspaces={workspaces}
        onSendMessage={sendMessageToAgent}
      />
    </div>
  );
}
