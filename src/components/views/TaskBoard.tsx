import React, { useState } from 'react';
import { useStore } from '../../store';
import { Card, CardContent } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { MessageSquare, MoreHorizontal, Plus, CheckSquare } from 'lucide-react';
import { Task, TaskStatus } from '../../types';
import { TaskDetail } from './TaskDetail';

export function TaskBoard() {
  const { tasks, agents, moveTask, addTask, addComment, addLog } = useStore();
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const COLUMNS: TaskStatus[] = ['Backlog', 'Planned', 'In Progress', 'Review', 'Needs Approval', 'Done', 'Failed'];

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData('taskId', taskId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, status: TaskStatus) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('taskId');
    const task = tasks.find(t => t.id === taskId);
    if (task && task.status !== status) {
      moveTask(taskId, status);
      addLog({
        agentId: 'system',
        action: 'Task Moved',
        details: `Task "${task.title}" moved to ${status}.`,
        type: 'info'
      });
    }
  };

  const handleAddSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const title = formData.get('title') as string;
    
    addTask({
      title,
      description: formData.get('description') as string,
      status: 'Backlog',
      priority: formData.get('priority') as any,
      risk: 'medium',
      creatorId: 'user',
      assigneeId: formData.get('assigneeId') as string || undefined,
      tags: (formData.get('tags') as string).split(',').map(s => s.trim()).filter(Boolean)
    });
    
    addLog({
      agentId: 'user',
      action: 'Task Created',
      details: `Created new task: "${title}".`,
      type: 'info'
    });
    
    setShowAdd(false);
  };

  const submitComment = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if(!selectedTask) return;
    
    const formData = new FormData(e.currentTarget);
    const content = formData.get('content') as string;
    
    addComment(selectedTask.id, {
      authorId: 'user',
      authorName: 'Admin (You)',
      content,
      isQuestion: content.endsWith('?')
    });
    
    addLog({
      agentId: 'user',
      action: 'Commented on Task',
      details: `Commented on "${selectedTask.title}".`,
      type: 'info'
    });
    
    // Update local state to reflect new comment
    const updatedTask = useStore.getState().tasks.find(t => t.id === selectedTask.id);
    if(updatedTask) setSelectedTask(updatedTask);
    
    e.currentTarget.reset();
  };

  return (
    <div className="h-full flex flex-col space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xs uppercase font-bold tracking-widest text-zinc-500">Company Board</h2>
          <p className="text-sm text-zinc-400 mt-1">Orchestrate tasks and workflows between agents.</p>
        </div>
        <Button onClick={() => setShowAdd(!showAdd)}>
          <Plus className="mr-2 h-4 w-4" />
          Assign Task
        </Button>
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="absolute inset-0" onClick={() => setShowAdd(false)} />
          <div className="relative w-full max-w-2xl bg-zinc-950 border border-zinc-800 xl:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-zinc-800 flex justify-between items-start bg-zinc-900/40 shrink-0">
              <div>
                <h3 className="text-xl font-semibold text-zinc-100">Create Task</h3>
                <p className="text-sm text-zinc-500 mt-1 mb-0">Define the work and assign to your AI workforce.</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setShowAdd(false)} className="rounded-full w-8 h-8 p-0 flex items-center justify-center -mt-2 -mr-2">×</Button>
            </div>
            
            <div className="p-6 overflow-y-auto">
              <form id="add-task-form" onSubmit={handleAddSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Title</label>
                    <Input name="title" required placeholder="e.g. Implement OAuth Flow" className="bg-zinc-900 shadow-inner border-zinc-800" />
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Assign To</label>
                    <select name="assigneeId" className="flex h-10 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1 text-sm text-zinc-100 shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500 focus-visible:border-indigo-500">
                      <option value="">Unassigned</option>
                      {agents.map(a => <option key={a.id} value={a.id}>{a.name} ({a.role})</option>)}
                    </select>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Priority</label>
                    <select name="priority" required className="flex h-10 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1 text-sm text-zinc-100 shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500 focus-visible:border-indigo-500">
                      <option value="Low">Low</option>
                      <option value="Medium">Medium</option>
                      <option value="High">High</option>
                      <option value="Urgent">Urgent</option>
                    </select>
                  </div>
                  
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Description</label>
                    <textarea 
                       name="description" 
                       rows={4}
                       className="flex w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 shadow-inner focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500 focus-visible:border-indigo-500"
                       placeholder="Brief details about the task, requirements, or links..." 
                    />
                  </div>
                  
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Tags (comma separated)</label>
                    <Input name="tags" placeholder="Backend, Feature, Security..." className="bg-zinc-900 shadow-inner border-zinc-800" />
                  </div>
                </div>
              </form>
            </div>
            
            <div className="p-6 border-t border-zinc-800 bg-zinc-950 flex justify-end gap-3 shrink-0">
              <Button variant="ghost" type="button" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button type="submit" form="add-task-form" className="bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/25">Create Task</Button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 overflow-x-auto pb-4">
        {COLUMNS.map(column => (
          <div 
            key={column}
            className="flex flex-col bg-zinc-900/40 rounded-xl border border-zinc-800 p-3"
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, column)}
          >
            <div className="flex items-center justify-between mb-4 px-1">
              <h3 className="text-xs uppercase font-bold tracking-widest text-zinc-500">{column}</h3>
              <span className="text-xs bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded">
                {tasks.filter(t => t.status === column).length}
              </span>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto">
              {tasks.filter(t => t.status === column).map(task => (
                <Card 
                  key={task.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, task.id)}
                  onClick={() => setSelectedTask(task)}
                  className={`cursor-pointer transition-colors ${task.status === 'Needs Approval' ? 'bg-zinc-900 border-amber-500/50 hover:border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.1)]' : 'bg-zinc-900 hover:border-zinc-600'}`}
                >
                  <CardContent className="p-4 flex flex-col gap-3">
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex flex-wrap gap-1">
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${
                          task.priority === 'Urgent' ? 'text-red-400 border-red-400/20 bg-red-400/10' :
                          task.priority === 'High' ? 'text-amber-400 border-amber-400/20 bg-amber-400/10' :
                          'text-zinc-400 border-zinc-800'
                        }`}>
                          {task.priority}
                        </Badge>
                      </div>
                      <Button variant="ghost" size="icon" className="h-5 w-5 -mr-1 -mt-1 text-zinc-500">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </div>
                    
                    {task.status === 'Needs Approval' && (
                       <div className="bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] px-2 py-1 flex items-center gap-1 font-semibold rounded -mt-1 cursor-pointer">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse mt-[0.5px]"></span>
                          Action required for {agents.find(a => a.id === task.assigneeId)?.name || 'Agent'}
                       </div>
                    )}
                    
                    <p className="text-sm text-zinc-200 font-medium leading-tight">{task.title}</p>
                    
                    {task.branch && (
                       <div className="flex items-center gap-1 text-[10px] text-zinc-500 bg-zinc-900/50 p-1 px-2 rounded font-mono">
                         <span className="opacity-50">⎇</span> {task.branch}
                       </div>
                    )}
                    
                    <div className="flex items-center justify-between mt-1">
                      {task.assigneeId ? (
                        <div className="flex items-center gap-2">
                          <div className="h-6 w-6 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-zinc-300">
                            {agents.find(a => a.id === task.assigneeId)?.name.substring(0, 2).toUpperCase() || '?'}
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-zinc-500">Unassigned</div>
                      )}
                      
                      <div className="flex items-center gap-3 text-zinc-500 text-xs">
                        {task.subtasks?.length > 0 && (
                          <div className="flex items-center gap-1">
                            <CheckSquare className="h-3 w-3" />
                            <span>{task.subtasks.filter(s => s.completed).length}/{task.subtasks.length}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1">
                          <MessageSquare className="h-3 w-3" />
                          <span>{task.comments?.length || 0}</span>
                        </div>
                        {task.cost > 0 && (
                          <div className="flex items-center gap-1 ml-auto text-indigo-400/80">
                            <span>${task.cost.toFixed(2)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>

      {selectedTask && (
        <TaskDetail task={selectedTask} onClose={() => setSelectedTask(null)} />
      )}
    </div>
  );
}
