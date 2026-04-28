import { AgentMessage } from '../../types';
import { cn } from '../../lib/utils';
import { renderMarkdown } from '../../lib/markdown';

interface MessageBubbleProps {
  message: AgentMessage;
  senderName: string;
  isFromMe?: boolean;
  compact?: boolean;
}

export function MessageBubble({ message, senderName, isFromMe, compact }: MessageBubbleProps) {
  const time = message.createdAt.slice(11, 16);
  const hasReply = message.status === 'replied' && message.reply;

  const contentHtml = renderMarkdown(
    compact && message.content.length > 60
      ? message.content.slice(0, 60) + '...'
      : message.content
  );
  const replyHtml = hasReply ? renderMarkdown(message.reply!) : null;

  return (
    <div className={cn('flex flex-col gap-1', isFromMe ? 'items-end' : 'items-start')}>
      <div className="flex items-center gap-2 text-xs text-zinc-500 px-1">
        <span className="font-medium text-zinc-400">{senderName}</span>
        <span>{time}</span>
        {message.status === 'replied' && (
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" title="Replied" />
        )}
        {message.status === 'pending' && (
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" title="Pending" />
        )}
        {message.status === 'delivered' && !message.reply && (
          <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" title="Delivered" />
        )}
      </div>

      <div
        className={cn(
          'max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed markdown-body',
          isFromMe
            ? 'bg-indigo-600 text-white rounded-br-sm'
            : 'bg-zinc-800 text-zinc-200 rounded-bl-sm'
        )}
        dangerouslySetInnerHTML={{ __html: contentHtml }}
      />

      {replyHtml && (
        <div
          className={cn(
            'max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed mt-0.5 border-l-2 border-emerald-400 markdown-body',
            isFromMe
              ? 'bg-zinc-800/50 text-zinc-400 rounded-tr-sm'
              : 'bg-zinc-800/50 text-zinc-400 rounded-tl-sm'
          )}
        >
          <span className="text-[10px] uppercase tracking-wider text-emerald-400 font-medium mr-1.5">Reply</span>
          <span dangerouslySetInnerHTML={{ __html: replyHtml }} />
        </div>
      )}
    </div>
  );
}
