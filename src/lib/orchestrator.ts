import { useEffect } from 'react';
import { useStore } from '../store';
import { Task, Agent } from '../types';

/**
 * The Orchestrator hook simulates the autonomous workflow of the agents.
 * It periodically checks tasks and advances their state or completes subtasks.
 */
export function useOrchestrator() {
  useEffect(() => {
    const interval = setInterval(() => {
      const state = useStore.getState();
      
      if (!state.isAutopilot || state.agents.length === 0 || state.tasks.length === 0) {
        return;
      }

      // Find an actionable task
      // Prioritize: In Progress -> Review -> Planned -> Backlog
      const actionableTask = state.tasks.find(t => t.status === 'In Progress') 
        || state.tasks.find(t => t.status === 'Review')
        || state.tasks.find(t => t.status === 'Planned')
        || state.tasks.find(t => t.status === 'Backlog');

      if (!actionableTask) return;

      const agent = state.agents.find(a => a.id === actionableTask.assigneeId);
      if (!agent) return; // Wait until assigned

      const now = new Date().toISOString();

      // State Machine Logic
      if (actionableTask.status === 'Backlog') {
        // Move to Planned
        state.moveTask(actionableTask.id, 'Planned');
        state.addLog({
          agentId: agent.id, // usually a PM does grooming, but we'll assign to the dev for now
          action: 'Task Groomed',
          details: `Moved "${actionableTask.title}" from Backlog to Planned.`,
          type: 'info'
        });
      }
      else if (actionableTask.status === 'Planned') {
        // Move to In Progress
        state.moveTask(actionableTask.id, 'In Progress');
        state.updateAgent(agent.id, { status: 'Working' });
        
        state.addComment(actionableTask.id, {
          authorId: agent.id,
          authorName: agent.name,
          content: `I'm starting work on this task.`,
          type: 'action'
        });
        
        state.addLog({
          agentId: agent.id,
          action: 'Task Started',
          details: `${agent.name} started working on "${actionableTask.title}".`,
          type: 'info'
        });
      } 
      else if (actionableTask.status === 'In Progress') {
        const incompleteSubtask = actionableTask.subtasks?.find(s => !s.completed);
        
        if (incompleteSubtask) {
          // Add cost to the task and total state
          const taskCost = Math.random() * 0.4 + 0.1;
          
          useStore.setState({ totalCost: state.totalCost + taskCost });
          state.updateTask(actionableTask.id, { cost: (actionableTask.cost || 0) + taskCost });

          // Simulate trace
          state.addComment(actionableTask.id, {
            authorId: agent.id,
            authorName: agent.name,
            content: `Trace: Ran commands to implement ${incompleteSubtask.title}`,
            type: 'trace',
            metadata: { cost: taskCost.toFixed(3) }
          });

          // Check off a subtask
          state.updateSubtask(actionableTask.id, incompleteSubtask.id, true);
          
          state.addComment(actionableTask.id, {
            authorId: agent.id,
            authorName: agent.name,
            content: `Completed subtask: ${incompleteSubtask.title}`,
            type: 'message'
          });
        } else {
          // All subtasks done, check if it needs approval?
          // Let's pretend tasks with High/critical risk or deploy tags need approval
          const needsApproval = actionableTask.risk === 'high' || actionableTask.risk === 'critical' || actionableTask.tags.includes('DevOps');
          
          if (needsApproval) {
            state.moveTask(actionableTask.id, 'Needs Approval');
            state.addApproval({
              taskId: actionableTask.id,
              agentId: agent.id,
              action: `Deploy / Finalize ${actionableTask.title}`,
              risk: actionableTask.risk,
              estimatedCost: Math.random() * 2
            });
            state.updateAgent(agent.id, { status: 'Blocked' });
            
            state.addComment(actionableTask.id, {
              authorId: agent.id,
              authorName: agent.name,
              content: `I've finished the core work, but I need administrator approval to proceed with execution tasks (Security policy: ${actionableTask.risk} risk).`,
              type: 'message'
            });
          } else {
            state.moveTask(actionableTask.id, 'Review');
            state.updateAgent(agent.id, { status: 'Idle' });
            
            const manager = state.agents.find(a => a.id === agent.parentId);
            const mention = manager ? `@${manager.name}` : `Admin`;
            
            state.addComment(actionableTask.id, {
              authorId: agent.id,
              authorName: agent.name,
              content: `Finished my work on this. ${mention}, please review it.`,
              type: 'message'
            });
          }
          
          state.addLog({
            agentId: agent.id,
            action: needsApproval ? 'Requested Approval' : 'Task Ready for Review',
            details: `${agent.name} ${needsApproval ? 'needs approval for' : 'completed'} "${actionableTask.title}".`,
            type: needsApproval ? 'warning' : 'success'
          });
        }
      }
      else if (actionableTask.status === 'Review') {
        const manager = state.agents.find(a => a.id === agent.parentId);
        
        state.moveTask(actionableTask.id, 'Done');
        
        state.addComment(actionableTask.id, {
          authorId: manager?.id || 'system',
          authorName: manager?.name || 'System',
          content: `LGTM. Approved and merging.`,
          type: 'action'
        });

        state.addLog({
          agentId: manager?.id || 'system',
          action: 'Task Approved',
          details: `"${actionableTask.title}" was reviewed and moved to Done.`,
          type: 'success'
        });
      }
      
    }, 4000); // Evaluates every 4 seconds for a nice visual tempo

    return () => clearInterval(interval);
  }, []);
}
