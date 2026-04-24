import { mutateStore, getStore } from './store';
import { Task, Agent } from '../types';

export function startOrchestrator() {
  setInterval(() => {
    const state = getStore();

    if (!state.isAutopilot || state.agents.length === 0 || state.tasks.length === 0) {
      return;
    }

    const actionableTask = state.tasks.find(t => t.status === 'In Progress')
      || state.tasks.find(t => t.status === 'Review')
      || state.tasks.find(t => t.status === 'Planned')
      || state.tasks.find(t => t.status === 'Backlog');

    if (!actionableTask) return;

    const agent = state.agents.find(a => a.id === actionableTask.assigneeId);
    if (!agent) return;

    const now = new Date().toISOString();

    mutateStore(s => {
      const task = s.tasks.find(t => t.id === actionableTask.id);
      const a = s.agents.find(x => x.id === agent.id);
      if (!task || !a) return;

      if (task.status === 'Backlog') {
        task.status = 'Planned';
        task.updatedAt = now;
        s.logs.unshift({
          id: crypto.randomUUID(),
          timestamp: now,
          agentId: agent.id,
          action: 'Task Groomed',
          details: `Moved "${task.title}" from Backlog to Planned.`,
          type: 'info'
        });
      }
      else if (task.status === 'Planned') {
        task.status = 'In Progress';
        task.updatedAt = now;
        a.status = 'Working';
        task.comments.push({
          id: crypto.randomUUID(),
          authorId: agent.id,
          authorName: agent.name,
          content: `I'm starting work on this task.`,
          createdAt: now,
          type: 'action'
        });
        s.logs.unshift({
          id: crypto.randomUUID(),
          timestamp: now,
          agentId: agent.id,
          action: 'Task Started',
          details: `${agent.name} started working on "${task.title}".`,
          type: 'info'
        });
      }
      else if (task.status === 'In Progress') {
        const incompleteSubtask = task.subtasks?.find(s => !s.completed);

        if (incompleteSubtask) {
          const taskCost = Math.random() * 0.4 + 0.1;
          s.totalCost += taskCost;
          task.cost = (task.cost || 0) + taskCost;
          task.comments.push({
            id: crypto.randomUUID(),
            authorId: agent.id,
            authorName: agent.name,
            content: `Trace: Ran commands to implement ${incompleteSubtask.title}`,
            createdAt: now,
            type: 'trace',
            metadata: { cost: taskCost.toFixed(3) }
          });
          const st = task.subtasks.find(s => s.id === incompleteSubtask.id);
          if (st) st.completed = true;
          task.comments.push({
            id: crypto.randomUUID(),
            authorId: agent.id,
            authorName: agent.name,
            content: `Completed subtask: ${incompleteSubtask.title}`,
            createdAt: now,
            type: 'message'
          });
        } else {
          const needsApproval = task.risk === 'high' || task.risk === 'critical' || task.tags.includes('DevOps');

          if (needsApproval) {
            task.status = 'Needs Approval';
            a.status = 'Blocked';
            s.approvals.unshift({
              id: crypto.randomUUID(),
              taskId: task.id,
              agentId: agent.id,
              action: `Deploy / Finalize ${task.title}`,
              risk: task.risk,
              estimatedCost: Math.random() * 2,
              status: 'pending',
              createdAt: now
            });
            task.comments.push({
              id: crypto.randomUUID(),
              authorId: agent.id,
              authorName: agent.name,
              content: `I've finished the core work, but I need administrator approval to proceed with execution tasks (Security policy: ${task.risk} risk).`,
              createdAt: now,
              type: 'message'
            });
          } else {
            task.status = 'Review';
            a.status = 'Idle';
            const manager = s.agents.find(x => x.id === agent.parentId);
            const mention = manager ? `@${manager.name}` : `Admin`;
            task.comments.push({
              id: crypto.randomUUID(),
              authorId: agent.id,
              authorName: agent.name,
              content: `Finished my work on this. ${mention}, please review it.`,
              createdAt: now,
              type: 'message'
            });
          }

          s.logs.unshift({
            id: crypto.randomUUID(),
            timestamp: now,
            agentId: agent.id,
            action: needsApproval ? 'Requested Approval' : 'Task Ready for Review',
            details: `${agent.name} ${needsApproval ? 'needs approval for' : 'completed'} "${task.title}".`,
            type: needsApproval ? 'warning' : 'success'
          });
        }
      }
      else if (task.status === 'Review') {
        const manager = s.agents.find(x => x.id === agent.parentId);
        task.status = 'Done';
        task.updatedAt = now;
        task.comments.push({
          id: crypto.randomUUID(),
          authorId: manager?.id || 'system',
          authorName: manager?.name || 'System',
          content: `LGTM. Approved and merging.`,
          createdAt: now,
          type: 'action'
        });
        s.logs.unshift({
          id: crypto.randomUUID(),
          timestamp: now,
          agentId: manager?.id || 'system',
          action: 'Task Approved',
          details: `"${task.title}" was reviewed and moved to Done.`,
          type: 'success'
        });
      }

      if (s.logs.length > 100) s.logs = s.logs.slice(0, 100);
      if (s.approvals.length > 100) s.approvals = s.approvals.slice(0, 100);
    });

  }, 4000);
}
