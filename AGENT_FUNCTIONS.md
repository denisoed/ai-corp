# AI Company Agent Functions (Tools)

## Overview

This document describes all available tools/functions that AI agents can use when communicating via Telegram or other interfaces. These functions allow agents to manage the company autonomously.

---

## Current Functions (Implemented)

### 1. `create_agent`

**Description:** Hire/Onboard a new AI agent into the company.

**Parameters:**
- `name` (string, required): Name of the agent
- `model` (string, required): AI model to use (e.g., "GPT 5.4 Mini", "qwen3.5-plus")
- `role` (string, required): Role — must be one of: Manager, Developer, Analyst, Reviewer, Designer, DevOps, Research
- `description` (string, required): Description of responsibilities
- `skills` (array of strings, required): List of skills (e.g., ["React", "Node.js"])
- `managerName` (string, optional): The name of the manager agent they report to

**Example:**
```json
{
  "name": "CodeReview Bot",
  "model": "qwen3.5-plus",
  "role": "Reviewer",
  "description": "Reviews all pull requests and code changes",
  "skills": ["Code Review", "Security", "Best Practices"],
  "managerName": "Alice"
}
```

---

### 2. `create_task`

**Description:** Create a new task on the Kanban board.

**Parameters:**
- `title` (string, required): Task title
- `description` (string, required): Detailed description
- `priority` (string, required): Low, Medium, High, or Urgent
- `risk` (string, required): low, medium, high, or critical
- `tags` (array of strings, optional): Tags like ["frontend", "bug"]
- `assigneeName` (string, optional): Name of the agent to assign this task to

**Example:**
```json
{
  "title": "Fix login bug",
  "description": "Users cannot log in with 2FA enabled",
  "priority": "High",
  "risk": "high",
  "tags": ["bug", "auth"],
  "assigneeName": "DevBot"
}
```

---

### 3. `get_company_state`

**Description:** Get a summary of the current agents and tasks.

**Parameters:**
- `focus` (string, required): "agents", "tasks", or "all"

**Returns:**
- `agents`: List of agents with name, role, status
- `tasks`: List of tasks with title, status, assignee
- Company-wide stats: agentsCount, tasksCount, activeTasks

---

## New Functions (Proposed)

### Task Management

#### 4. `move_task`

**Description:** Move a task to a different status/column on the Kanban board.

**Parameters:**
- `taskTitle` (string, required): Title or partial title of the task to move
- `newStatus` (string, required): Target status — Backlog, Planned, In Progress, Review, Needs Approval, Done

**Use Case:** Bot can autonomously progress tasks through the pipeline based on completion criteria.

---

#### 5. `assign_task`

**Description:** Assign or reassign a task to a specific agent.

**Parameters:**
- `taskTitle` (string, required): Title or partial title of the task
- `agentName` (string, required): Name of the agent to assign to

**Use Case:** Balance workload by redistributing tasks without UI interaction.

---

#### 6. `update_task`

**Description:** Update task properties (priority, risk, description, tags).

**Parameters:**
- `taskTitle` (string, required): Title or partial title of the task
- `priority` (string, optional): Low, Medium, High, Urgent
- `risk` (string, optional): low, medium, high, critical
- `description` (string, optional): Updated description
- `tags` (array of strings, optional): New tags (replaces existing)

**Use Case:** Adjust task parameters as requirements change during execution.

---

#### 7. `delete_task`

**Description:** Remove a task from the board.

**Parameters:**
- `taskTitle` (string, required): Title or partial title of the task to delete

**Use Case:** Clean up duplicate, obsolete, or mistakenly created tasks.

---

#### 8. `add_task_comment`

**Description:** Add a comment or note to an existing task.

**Parameters:**
- `taskTitle` (string, required): Title or partial title of the task
- `content` (string, required): Comment text
- `type` (string, optional): message, action, trace (default: message)

**Use Case:** Leave progress notes, trace logs, or questions directly on tasks.

---

#### 9. `create_subtask`

**Description:** Break down a task into smaller subtasks.

**Parameters:**
- `taskTitle` (string, required): Parent task title
- `subtaskTitle` (string, required): Title of the new subtask

**Use Case:** Decompose large tasks into actionable steps.

---

#### 10. `complete_subtask`

**Description:** Mark a subtask as completed.

**Parameters:**
- `taskTitle` (string, required): Parent task title
- `subtaskTitle` (string, required): Subtask title to mark done

**Use Case:** Track incremental progress within a task.

---

#### 11. `add_task_tag` / `remove_task_tag`

**Description:** Add or remove a tag from a task.

**Parameters:**
- `taskTitle` (string, required): Task title
- `tag` (string, required): Tag to add or remove

**Use Case:** Categorize and filter tasks dynamically (e.g., mark as "urgent" or "blocked").

---

### Agent Management

#### 12. `update_agent`

**Description:** Modify an existing agent's properties.

**Parameters:**
- `agentName` (string, required): Current name of the agent to update
- `newName` (string, optional): New name for the agent
- `model` (string, optional): New AI model
- `role` (string, optional): New role
- `description` (string, optional): Updated description
- `skills` (array of strings, optional): New skills list

**Use Case:** Adapt agent capabilities as project needs evolve.

---

#### 13. `delete_agent`

**Description:** Remove (fire) an agent from the company.

**Parameters:**
- `agentName` (string, required): Name of the agent to remove

**Use Case:** Clean up unused or redundant agents.

---

#### 14. `set_agent_status`

**Description:** Manually set an agent's operational status.

**Parameters:**
- `agentName` (string, required): Agent name
- `status` (string, required): Idle, Working, Blocked, Offline, Error

**Use Case:** Temporarily block an agent for maintenance or mark as available.

---

#### 15. `get_agent_details`

**Description:** Get detailed information about a specific agent and their current workload.

**Parameters:**
- `agentName` (string, required): Name of the agent

**Returns:** Agent details + list of assigned tasks with statuses.

**Use Case:** Quickly audit what a specific agent is working on.

---

### Process Control

#### 16. `resolve_approval`

**Description:** Approve or reject a pending approval request.

**Parameters:**
- `approvalId` (string, required): ID of the approval request
- `approved` (boolean, required): true to approve, false to reject

**Use Case:** Handle high-risk task approvals directly from Telegram.

---

#### 17. `search_tasks`

**Description:** Find tasks matching criteria.

**Parameters:**
- `status` (string, optional): Filter by status
- `priority` (string, optional): Filter by priority
- `tag` (string, optional): Filter by tag
- `assigneeName` (string, optional): Filter by assigned agent

**Use Case:** Navigate large task boards without scrolling.

---

#### 18. `get_task_details`

**Description:** Get full information about a task including comments, subtasks, and history.

**Parameters:**
- `taskTitle` (string, required): Task title

**Returns:** Complete task object with all nested data.

**Use Case:** Deep analysis of a specific task's lifecycle.

---

### Communication & Reporting

#### 19. `send_broadcast`

**Description:** Send a message to all agents that have Telegram bots configured.

**Parameters:**
- `message` (string, required): Text to broadcast

**Use Case:** Team-wide announcements and status updates.

---

#### 20. `generate_report`

**Description:** Generate a textual summary report of the company state.

**Parameters:**
- `type` (string, required): "dashboard", "agents", "tasks", "costs"

**Returns:** Human-readable report with statistics.

**Use Case:** Quick status updates for management without opening the UI.

---

### Scheduling & Automation

#### 21. `create_cron`

**Description:** Create a scheduled cron job for an agent. The agent will execute the given prompt on the specified schedule using its AI capabilities and available tools.

**Parameters:**
- `name` (string, required): Name of the cron job
- `agentName` (string, required): Name of the agent who will execute this job
- `schedule` (string, required): Cron expression. Examples:
  - `"*/30 * * * *"` — every 30 minutes
  - `"0 */6 * * *"` — every 6 hours
  - `"0 9 * * 1"` — every Monday at 9am
  - `"0 0 * * *"` — daily at midnight
- `prompt` (string, required): Natural language instruction for the agent
- `description` (string, optional): Description of what this cron job does

**Use Case:** Schedule agents to periodically check GitHub issues, generate reports, run maintenance tasks, etc.

---

#### 22. `list_crons`

**Description:** List all cron jobs in the current workspace.

**Parameters:** None

**Returns:** List of cron jobs with names, agents, schedules, statuses, and last run results.

**Use Case:** See what automated tasks are configured and their status.

---

#### 23. `delete_cron`

**Description:** Delete a cron job by name.

**Parameters:**
- `cronName` (string, required): Name of the cron job to delete

**Use Case:** Remove scheduled tasks that are no longer needed.

---

#### 24. `update_cron`

**Description:** Update a cron job — change its schedule, prompt, or enable/disable it.

**Parameters:**
- `cronName` (string, required): Name of the cron job to update
- `schedule` (string, optional): New cron expression
- `prompt` (string, optional): New instruction for the agent
- `enabled` (boolean, optional): Enable or disable the cron job
- `description` (string, optional): New description

**Use Case:** Modify when or what a scheduled agent should do.

---

#### 25. `run_cron_now`

**Description:** Manually trigger a cron job to run immediately.

**Parameters:**
- `cronName` (string, required): Name of the cron job to run now

**Use Case:** Test a cron job or execute it on demand without waiting for the schedule.

---

## Implementation Priority

### Phase 1 — Core Operations (Must Have)
1. `move_task`
2. `assign_task`
3. `update_task`
4. `delete_task`
5. `add_task_comment`
6. `resolve_approval`

### Phase 2 — Enhanced Control
7. `search_tasks`
8. `get_task_details`
9. `get_agent_details`
10. `update_agent`
11. `set_agent_status`
12. `delete_agent`

### Phase 3 — Advanced Features
13. `create_subtask`
14. `complete_subtask`
15. `add_task_tag` / `remove_task_tag`
16. `send_broadcast`
17. `generate_report`

### Phase 4 — Scheduling & Automation (Implemented)
18. `create_cron`
19. `list_crons`
20. `delete_cron`
21. `update_cron`
22. `run_cron_now`

---

## Technical Notes

- All functions operate on the server-side store (`~/.aicorp/settings.json` + `~/.aicorp/workspace/*.json`)
- Changes are persisted immediately to disk
- The store state is synchronized to all connected clients every 2 seconds
- Each function should log its action to the company logs for audit purposes
- Agent name matching is case-insensitive and supports partial matches
