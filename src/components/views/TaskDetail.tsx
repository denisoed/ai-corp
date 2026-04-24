import React from 'react';
import { Task, SubTask, Comment, Agent } from '../../types';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { CheckCircle2, MessageSquare, Plus, Clock, Play, HelpCircle, Check, CornerDownRight } from 'lucide-react';
import { useStore } from '../../store';

interface TaskDetailProps {
  task: Task;
  onClose: () => void;
}

export function TaskDetail({ task, onClose }: TaskDetailProps) {
  const { agents, approvals, updateSubtask, addComment, moveTask, resolveApproval } = useStore();
  const assignee = agents.find(a => a.id === task.assigneeId);
  const manager = assignee?.parentId ? agents.find(a => a.id === assignee.parentId) : null;
  const pendingApproval = approvals?.find(a => a.taskId === task.id && a.status === 'pending');

  const submitComment = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const content = formData.get('content') as string;
    addComment(task.id, {
      authorId: 'user',
      authorName: 'Admin (You)',
      content,
      isQuestion: content.endsWith('?'),
      type: 'message'
    });
    e.currentTarget.reset();
  };

  const handleApprove = () => {
    if (pendingApproval) {
      resolveApproval(pendingApproval.id, true);
    } else {
      moveTask(task.id, 'Done');
      addComment(task.id, {
        authorId: 'user',
        authorName: 'Admin (You)',
        content: 'I have reviewed and approved this work. Great job.',
        type: 'action'
      });
    }
  };

  const handleReject = () => {
    if (pendingApproval) {
      resolveApproval(pendingApproval.id, false);
    } else {
      moveTask(task.id, 'In Progress');
      addComment(task.id, {
        authorId: 'user',
        authorName: 'Admin (You)',
        content: 'This needs changes. Moving back to In Progress.',
        type: 'action'
      });
    }
  };

  const totalSubtasks = task.subtasks?.length || 0;
  const completedSubtasks = task.subtasks?.filter(s => s.completed).length || 0;
  const progressPercent = totalSubtasks === 0 ? 0 : Math.round((completedSubtasks / totalSubtasks) * 100);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/80 backdrop-blur-sm sm:p-4">
      <div 
        className="absolute inset-0"
        onClick={onClose}
      />
      <div className="relative w-full max-w-3xl bg-zinc-950 sm:rounded-2xl border border-zinc-800 h-full overflow-hidden flex flex-col shadow-2xl animate-in slide-in-from-right">
        {/* Header Streamline */}
        <div className="flex-none p-6 border-b border-zinc-800 bg-zinc-950 z-10 w-full relative">
           <div className="flex justify-between items-start mb-4">
               <div>
                  <div className="flex items-center gap-2 mb-2">
                     <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">{task.title.substring(0,3).toUpperCase()}-{task.id.split('-')[0].substring(0,4).toUpperCase()}</span>
                     <Badge variant="outline" className={`text-xs ml-2 ${task.status === 'Done' ? 'text-emerald-400 border-emerald-400/20 bg-emerald-400/10' : ''}`}>{task.status}</Badge>
                     <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${
                          task.priority === 'Urgent' ? 'text-red-400 border-red-400/20 bg-red-400/10' :
                          task.priority === 'High' ? 'text-amber-400 border-amber-400/20 bg-amber-400/10' :
                          'text-zinc-400 border-zinc-800'
                        }`}>
                          Priority: {task.priority}
                      </Badge>
                  </div>
                  <h2 className="text-2xl font-semibold text-zinc-100">{task.title}</h2>
               </div>
               <Button variant="ghost" size="sm" onClick={onClose} className="rounded-full w-8 h-8 flex items-center justify-center p-0">×</Button>
           </div>
           
           {/* Progress Stepper */}
           <div className="mt-6 flex items-center justify-between relative">
             <div className="absolute top-1/2 left-0 right-0 h-[2px] bg-zinc-800 -z-10 -translate-y-1/2 rounded-full" />
             <div className="absolute top-1/2 left-0 h-[2px] bg-indigo-500 -z-10 -translate-y-1/2 transition-all duration-1000" style={{
                 width: task.status === 'Backlog' ? '0%' : task.status === 'In Progress' ? '33%' : task.status === 'Review' ? '66%' : '100%'
             }} />
             
             {['Backlog', 'In Progress', 'Review', 'Done'].map((step, idx) => {
                 const isActive = step === task.status;
                 const isPast = ['Backlog', 'In Progress', 'Review', 'Done'].indexOf(task.status) > idx;
                 return (
                     <div key={step} className="flex flex-col items-center gap-2">
                         <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                             isActive ? 'bg-indigo-500 text-white shadow-[0_0_15px_rgba(99,102,241,0.5)]' : 
                             isPast ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' : 'bg-zinc-900 border border-zinc-800 text-zinc-500'
                         }`}>
                             {isPast ? <Check size={14} /> : idx + 1}
                         </div>
                         <span className={`text-[10px] uppercase tracking-widest font-bold ${isActive ? 'text-indigo-400' : 'text-zinc-600'}`}>{step}</span>
                     </div>
                 )
             })}
           </div>
        </div>

        <div className="flex-1 flex flex-col overflow-y-auto w-full">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-0 min-h-full">
                {/* Left Side: Detail & Subtasks */}
                <div className="md:col-span-2 p-6 border-r border-zinc-800 bg-zinc-950">
                    <section className="mb-8">
                        <h4 className="text-xs font-bold text-zinc-500 mb-2 uppercase tracking-widest">Description</h4>
                        <p className="text-sm text-zinc-300 leading-relaxed bg-zinc-900/50 p-4 rounded-xl border border-zinc-800/50">
                            {task.description || "No specific details provided for this task."}
                        </p>
                        <div className="flex flex-wrap gap-2 mt-4">
                            {task.tags.map(t => (
                                <span key={t} className="px-2 py-1 bg-zinc-900 text-zinc-400 rounded text-xs border border-zinc-800">#{t}</span>
                            ))}
                        </div>
                    </section>

                    <section className="mb-8">
                        <div className="flex items-center justify-between mb-4">
                            <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Sub-Tasks Execution ({completedSubtasks}/{totalSubtasks})</h4>
                            {totalSubtasks > 0 && <span className="text-xs text-indigo-400 font-mono">{progressPercent}%</span>}
                        </div>
                        {totalSubtasks === 0 ? (
                           <p className="text-xs text-zinc-600">No defined subtasks.</p>
                        ) : (
                           <div className="space-y-2">
                             <div className="h-1 w-full bg-zinc-900 rounded-full mb-4 overflow-hidden">
                                 <div className="h-full bg-indigo-500 transition-all duration-500" style={{ width: `${progressPercent}%` }} />
                             </div>
                             {task.subtasks.map(subtask => (
                               <div key={subtask.id} className="flex items-start gap-3 p-3 rounded-lg border border-zinc-800 bg-zinc-900/30 group">
                                  <button 
                                      onClick={() => updateSubtask(task.id, subtask.id, !subtask.completed)}
                                      className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded border flex items-center justify-center transition-colors ${subtask.completed ? 'bg-indigo-500 border-indigo-500 text-white' : 'border-zinc-700 bg-zinc-900 text-transparent group-hover:border-indigo-500'}`}
                                  >
                                      <Check size={12} />
                                  </button>
                                  <span className={`text-sm ${subtask.completed ? 'text-zinc-500 line-through' : 'text-zinc-300'}`}>
                                      {subtask.title}
                                  </span>
                               </div>
                             ))}
                           </div>
                        )}
                    </section>

                    {/* Agent Comm Thread */}
                    <section>
                         <h4 className="text-xs font-bold text-zinc-500 mb-4 uppercase tracking-widest flex items-center gap-2"><MessageSquare size={14} /> Agent Timeline</h4>
                         <div className="space-y-4">
                             {task.comments.length === 0 ? (
                               <div className="text-center p-8 border border-zinc-800/50 border-dashed rounded-xl">
                                  <p className="text-sm text-zinc-600">No communication logs recorded yet.</p>
                               </div>
                             ) : (
                               task.comments.map(comment => {
                                  const isUser = comment.authorId === 'user';
                                  const isAction = comment.type === 'action';
                                  const isTrace = comment.type === 'trace';
                                  
                                  if (isAction) {
                                      return (
                                          <div key={comment.id} className="flex justify-center my-4">
                                              <div className="bg-zinc-900 px-3 py-1 rounded-full border border-zinc-800 text-xs text-zinc-500 flex items-center gap-2">
                                                  <Clock size={12} />
                                                  <span className="font-semibold text-zinc-400">{comment.authorName}</span> {comment.content} 
                                                  <span className="ml-1 text-[9px] opacity-60 font-mono">{new Date(comment.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                              </div>
                                          </div>
                                      )
                                  }

                                  if (isTrace) {
                                     return (
                                        <div key={comment.id} className="ml-11 border-l-2 border-zinc-800 pl-4 py-2 my-2 opacity-80 hover:opacity-100 transition-opacity">
                                           <div className="flex gap-2 items-center text-xs text-zinc-500 mb-1 font-mono">
                                              <span className="text-zinc-600">[{new Date(comment.createdAt).toLocaleTimeString()}]</span>
                                              <span className="text-indigo-400/80">system.execute_task</span>
                                              {comment.metadata?.cost && <span className="text-emerald-500/80">${comment.metadata.cost}</span>}
                                           </div>
                                           <div className="text-xs text-zinc-400 bg-black/40 p-2 rounded border border-zinc-800/50 font-mono">
                                              {comment.content}
                                           </div>
                                        </div>
                                     )
                                  }

                                  return (
                                     <div key={comment.id} className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
                                         <div className={`h-8 w-8 rounded-full flex-shrink-0 flex items-center justify-center font-bold text-xs ${isUser ? 'bg-indigo-600 text-white' : 'bg-zinc-800 text-zinc-300'}`}>
                                             {isUser ? 'AD' : comment.authorName.substring(0, 2).toUpperCase()}
                                         </div>
                                         <div className={`flex flex-col gap-1 max-w-[85%] ${isUser ? 'items-end' : 'items-start'}`}>
                                            <div className="flex items-baseline gap-2">
                                                <span className="text-xs font-semibold text-zinc-400">{comment.authorName}</span>
                                                <span className="text-[10px] text-zinc-600 font-mono">{new Date(comment.createdAt).toLocaleTimeString()}</span>
                                            </div>
                                            <div className={`p-3 rounded-2xl text-sm leading-relaxed ${
                                                isUser ? 'bg-indigo-600/20 border border-indigo-500/30 text-indigo-100 rounded-tr-sm' : 
                                                comment.isQuestion ? 'bg-amber-500/10 border border-amber-500/20 text-amber-100 rounded-tl-sm' :
                                                'bg-zinc-900 border border-zinc-800 text-zinc-300 rounded-tl-sm'
                                            }`}>
                                                {comment.content}
                                            </div>
                                         </div>
                                     </div>
                                  )
                               })
                             )}
                         </div>
                    </section>
                </div>

                {/* Right Side: Execution Context */}
                <div className="p-6 bg-zinc-900/20 flex flex-col w-full h-full">
                     <h4 className="text-xs font-bold text-zinc-500 mb-4 uppercase tracking-widest">Delegation Chain</h4>
                     
                     <div className="space-y-0 relative">
                         {/* Chain line */}
                         <div className="absolute top-6 bottom-6 left-5 w-[1px] bg-zinc-800 -z-10" />

                         {manager ? (
                             <div className="flex gap-4 items-start relative pb-6">
                                <div className="h-10 w-10 flex-shrink-0 rounded-xl bg-zinc-900 border border-zinc-700 flex items-center justify-center font-bold text-zinc-400 text-xs shadow-lg">
                                    {manager.name.substring(0,2)}
                                </div>
                                <div className="pt-1">
                                    <p className="text-xs text-zinc-500 font-medium">Delegated By</p>
                                    <p className="text-sm font-semibold text-zinc-200">{manager.name}</p>
                                    <span className="text-[10px] text-zinc-500">{manager.role}</span>
                                </div>
                             </div>
                         ) : (
                             <div className="flex gap-4 items-start relative mb-6">
                                <div className="h-10 w-10 flex-shrink-0 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center font-bold text-indigo-400 text-xs text-center leading-none shadow-lg">
                                    SYS
                                </div>
                                <div className="pt-1">
                                    <p className="text-xs text-zinc-500 font-medium">Delegated By</p>
                                    <p className="text-sm font-semibold text-indigo-400">Root Hub</p>
                                </div>
                             </div>
                         )}

                         <div className="flex gap-4 items-start relative">
                            <div className="absolute bg-zinc-950 p-1 -left-1 text-zinc-600 top-2 z-10">
                                <CornerDownRight size={16} />
                            </div>
                            <div className="h-10 w-10 flex-shrink-0 rounded-xl bg-zinc-800 border border-zinc-600 flex items-center justify-center font-bold text-white text-xs shadow-lg z-20 ml-[2px]">
                                {assignee ? assignee.name.substring(0,2).toUpperCase() : '?'}
                            </div>
                            <div className="pt-1">
                                <p className="text-xs text-zinc-500 font-medium">Assigned Executor</p>
                                {assignee ? (
                                    <>
                                        <p className="text-sm font-semibold text-white">{assignee.name}</p>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="text-[10px] text-zinc-500">{assignee.model}</span>
                                            <div className="flex items-center gap-1">
                                              <div className={`w-1.5 h-1.5 rounded-full ${assignee.status === 'Working' ? 'bg-emerald-500' : 'bg-zinc-500'}`} />
                                              <span className="text-[10px] text-zinc-400">{assignee.status}</span>
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <p className="text-sm font-semibold text-zinc-600 italic">Unassigned</p>
                                )}
                            </div>
                         </div>
                     </div>
                </div>
            </div>
        </div>

        {/* Bottom Actions Area */}
        <div className="flex-none bg-zinc-950 border-t border-zinc-800 w-full relative z-20">
            {(task.status === 'Needs Approval' || task.status === 'Review') && (
                <div className={`absolute bottom-full mb-4 left-4 right-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 p-4 border rounded-2xl shadow-xl backdrop-blur-md flex flex-col sm:flex-row items-center gap-4 animate-in slide-in-from-bottom-4 ${
                    task.status === 'Needs Approval' 
                       ? 'bg-amber-950/90 border-amber-500/50 shadow-amber-500/10' 
                       : 'bg-indigo-950/90 border-indigo-500/50 shadow-indigo-500/10'
                }`}>
                    <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                            {task.status === 'Needs Approval' && (
                                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-amber-500/20 text-amber-400">
                                    <HelpCircle size={14} />
                                </span>
                            )}
                            <p className={`text-sm font-semibold ${task.status === 'Needs Approval' ? 'text-amber-100' : 'text-indigo-100'}`}>
                                {task.status === 'Needs Approval' ? 'Approval Required' : 'User Review Required'}
                            </p>
                        </div>
                        {task.status === 'Needs Approval' && pendingApproval ? (
                             <p className="text-xs text-amber-300">
                                Agent <strong className="text-amber-100">{assignee?.name}</strong> needs approval to perform an action. <br/>
                                <span className="font-mono bg-amber-900/60 leading-relaxed px-2 py-0.5 rounded mt-2 inline-block text-amber-200 border border-amber-500/30">
                                    ▶ {pendingApproval.action}
                                </span>
                             </p>
                        ) : (
                             <p className="text-xs text-indigo-300">
                                Agent {assignee?.name} has completed the work and requested a final review from {manager?.name || 'you'}.
                             </p>
                        )}
                    </div>
                    <div className="flex items-center gap-2 w-full sm:w-auto mt-2 sm:mt-0 lg:ml-8">
                        <Button variant="outline" onClick={handleReject} className={`flex-1 sm:flex-none ${
                            task.status === 'Needs Approval' ? 'border-amber-500/30 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300' : 'border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300'
                        }`}>
                            {task.status === 'Needs Approval' ? 'Reject & Rework' : 'Request Changes'}
                        </Button>
                        <Button onClick={handleApprove} className={`flex-1 sm:flex-none shadow-lg ${
                            task.status === 'Needs Approval' ? 'bg-amber-500 hover:bg-amber-600 text-amber-950 shadow-amber-500/25' : 'bg-indigo-500 hover:bg-indigo-600 text-white shadow-indigo-500/25'
                        }`}>
                            {task.status === 'Needs Approval' ? 'Approve & Continue' : 'Approve & Complete'}
                        </Button>
                    </div>
                </div>
            )}
            
            <form onSubmit={submitComment} className="flex gap-3 p-4 sm:p-6 w-full bg-zinc-900/30">
                <Input 
                   name="content" 
                   placeholder="Message the agent, drop context, or ask a question..." 
                   required 
                   className="flex-1 bg-zinc-950 border-zinc-800 shadow-inner"
                />
                <Button type="submit" className="flex-none shadow-md">Send</Button>
            </form>
        </div>
      </div>
    </div>
  );
}
