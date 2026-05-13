
export const companyTools = [
  {
    type: 'function' as const,
    function: {
      name: 'create_agent',
      description: 'Hire a new AI agent. You can only create agents under a manager you are connected to. Use soul/identity/roleDoc to define personality directly.',
      parameters: {
        type: 'object' as const,
        properties: {
          name: { type: 'string' as const, description: 'Name of the agent' },
          skills: { type: 'array' as const, items: { type: 'string' as const }, description: 'List of skills' },
          managerName: { type: 'string' as const, description: 'Optional. The name of the manager agent they report to.' },
          role: { type: 'string' as const, description: 'Optional. Legacy role hint. Prefer defining behavior via soul/identity/roleDoc instead.' },
          soul: { type: 'string' as const, description: 'Optional. SOUL.md content — core principles, values, and boundaries.' },
          identity: { type: 'string' as const, description: 'Optional. IDENTITY.md content — personality, tone, communication style.' },
          roleDoc: { type: 'string' as const, description: 'Optional. ROLE.md content — responsibilities, expertise, authority, collaboration.' }
        },
        required: ['name', 'skills']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'create_task',
      description: 'Create a new task on the Kanban board. Connected agents only.',
      parameters: {
        type: 'object' as const,
        properties: {
          title: { type: 'string' as const },
          description: { type: 'string' as const },
          priority: { type: 'string' as const, description: 'Must be: Low, Medium, High, or Urgent' },
          risk: { type: 'string' as const, description: 'Must be: low, medium, high, or critical' },
          tags: { type: 'array' as const, items: { type: 'string' as const }, description: 'Tag names' },
          assigneeName: { type: 'string' as const, description: 'Optional. Name of the agent to assign this task to.' }
        },
        required: ['title', 'description', 'priority', 'risk']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_company_state',
      description: 'Get overview of agents, tasks or both. focus: "agents", "tasks", or "all".',
      parameters: {
        type: 'object' as const,
        properties: {
          focus: { type: 'string' as const, description: '"agents" or "tasks" or "all"' }
        },
        required: ['focus']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'move_task',
      description: 'Move a task to a different column/status on the Kanban board.',
      parameters: {
        type: 'object' as const,
        properties: {
          taskTitle: { type: 'string' as const, description: 'Title or partial title of the task' },
          newStatus: { type: 'string' as const, description: 'Must be: Backlog, Planned, In Progress, Review, Needs Approval, Done, Failed, or Blocked' }
        },
        required: ['taskTitle', 'newStatus']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'assign_task',
      description: 'Assign or reassign a task to a specific agent by name. Connected agents only.',
      parameters: {
        type: 'object' as const,
        properties: {
          taskTitle: { type: 'string' as const, description: 'Title or partial title of the task' },
          agentName: { type: 'string' as const, description: 'Name of the agent to assign to' }
        },
        required: ['taskTitle', 'agentName']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'update_task',
      description: 'Update task properties (priority, risk, description, tags).',
      parameters: {
        type: 'object' as const,
        properties: {
          taskTitle: { type: 'string' as const, description: 'Title or partial title of the task' },
          priority: { type: 'string' as const, description: 'Optional. Must be: Low, Medium, High, or Urgent' },
          risk: { type: 'string' as const, description: 'Optional. Must be: low, medium, high, or critical' },
          description: { type: 'string' as const, description: 'Optional. Updated description' },
          tags: { type: 'array' as const, items: { type: 'string' as const }, description: 'Optional. New tags (replaces existing)' }
        },
        required: ['taskTitle']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'delete_task',
      description: 'Remove a task from the board permanently.',
      parameters: {
        type: 'object' as const,
        properties: {
          taskTitle: { type: 'string' as const, description: 'Title or partial title of the task to delete' }
        },
        required: ['taskTitle']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'add_task_comment',
      description: 'Add a comment to a task. Connected agents only. Unassigned tasks can be commented on by any agent.',
      parameters: {
        type: 'object' as const,
        properties: {
          taskTitle: { type: 'string' as const, description: 'Title or partial title of the task' },
          content: { type: 'string' as const, description: 'Comment text' },
          type: { type: 'string' as const, description: 'Optional. message, action, or trace (default: message)' }
        },
        required: ['taskTitle', 'content']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'create_subtask',
      description: 'Break down a task into smaller subtasks.',
      parameters: {
        type: 'object' as const,
        properties: {
          taskTitle: { type: 'string' as const, description: 'Parent task title' },
          subtaskTitle: { type: 'string' as const, description: 'Title of the new subtask' }
        },
        required: ['taskTitle', 'subtaskTitle']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'complete_subtask',
      description: 'Mark a subtask as completed.',
      parameters: {
        type: 'object' as const,
        properties: {
          taskTitle: { type: 'string' as const, description: 'Parent task title' },
          subtaskTitle: { type: 'string' as const, description: 'Subtask title to mark done' }
        },
        required: ['taskTitle', 'subtaskTitle']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'add_task_tag',
      description: 'Add a tag to a task.',
      parameters: {
        type: 'object' as const,
        properties: {
          taskTitle: { type: 'string' as const, description: 'Task title' },
          tag: { type: 'string' as const, description: 'Tag to add' }
        },
        required: ['taskTitle', 'tag']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'remove_task_tag',
      description: 'Remove a tag from a task.',
      parameters: {
        type: 'object' as const,
        properties: {
          taskTitle: { type: 'string' as const, description: 'Task title' },
          tag: { type: 'string' as const, description: 'Tag to remove' }
        },
        required: ['taskTitle', 'tag']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'subscribe_to_event',
      description: 'Subscribe to a domain event. Use this when you want notifications about a specific change in the system, such as a task update, message reply, approval, or another supported event.',
      parameters: {
        type: 'object' as const,
        properties: {
           eventType: { type: 'string' as const, description: 'Event type, e.g. "task.status.changed", "approval.requested". Omit to subscribe to all.' },
          taskTitle: { type: 'string' as const, description: 'Optional. Title or partial title of the task to watch when subscribing to task events' },
          taskId: { type: 'string' as const, description: 'Optional. Exact task id to watch when subscribing to task events' },
          channel: { type: 'string' as const, description: 'Optional. telegram or in_app (default: telegram)' },
          instructions: { type: 'string' as const, description: 'Optional. Extra wording to include in the notification, like "give me a short summary".' },
          oneshot: { type: 'boolean' as const, description: 'Optional. If true, the subscription is automatically deleted after the first notification is sent.' }
        },
        required: []
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'list_subscriptions',
      description: 'List your active subscriptions so you can review what you are tracking.',
      parameters: {
        type: 'object' as const,
        properties: {},
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'update_subscription',
      description: 'Update an existing subscription, for example to enable or disable it, change the delivery channel, or adjust instructions.',
      parameters: {
        type: 'object' as const,
        properties: {
          subscriptionId: { type: 'string' as const, description: 'The subscription id to update' },
          enabled: { type: 'boolean' as const, description: 'Optional. Turn the subscription on or off' },
          channel: { type: 'string' as const, description: 'Optional. telegram or in_app' },
          instructions: { type: 'string' as const, description: 'Optional. Replace or set the notification instructions' }
        },
        required: ['subscriptionId']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'delete_subscription',
      description: 'Delete a subscription permanently.',
      parameters: {
        type: 'object' as const,
        properties: {
          subscriptionId: { type: 'string' as const, description: 'The subscription id to delete' }
        },
        required: ['subscriptionId']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'update_agent',
      description: "Modify an existing agent's properties.",
      parameters: {
        type: 'object' as const,
        properties: {
          agentName: { type: 'string' as const, description: 'Current name of the agent to update' },
          newName: { type: 'string' as const, description: 'Optional. New name for the agent' },
          model: { type: 'string' as const, description: 'Optional. New AI model' },
           role: { type: 'string' as const, description: 'Agent role (e.g. Developer, Reviewer, Manager).' },
          description: { type: 'string' as const, description: 'Optional. Updated description' },
          skills: { type: 'array' as const, items: { type: 'string' as const }, description: 'Optional. New skills list' }
        },
        required: ['agentName']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'delete_agent',
      description: 'Remove (fire) an agent from the company.',
      parameters: {
        type: 'object' as const,
        properties: {
          agentName: { type: 'string' as const, description: 'Name of the agent to remove' }
        },
        required: ['agentName']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'set_agent_status',
      description: "Manually set an agent's operational status.",
      parameters: {
        type: 'object' as const,
        properties: {
          agentName: { type: 'string' as const, description: 'Agent name' },
          status: { type: 'string' as const, description: 'Must be: Idle, Working, Blocked, Offline, or Error' }
        },
        required: ['agentName', 'status']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_agent_details',
      description: 'Get agent info: role, skills, tasks, and your connection type (manager, subordinate, collaborator, or none).',
      parameters: {
        type: 'object' as const,
        properties: {
          agentName: { type: 'string' as const, description: 'Name of the agent' }
        },
        required: ['agentName']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_my_connections',
      description: 'List your manager, subordinates, and collaborators.',
      parameters: {
        type: 'object' as const,
        properties: {},
        required: []
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'add_connection',
      description: 'Create a connection between two agents. "manager": agentName manages targetAgentName. "collaborator": bidirectional peers. Manager is always agentName, subordinate is targetAgentName.',
      parameters: {
        type: 'object' as const,
        properties: {
          agentName: { type: 'string' as const, description: 'For "manager" type — this agent becomes the manager (the boss). For "collaborator" — either agent, order does not matter.' },
          targetAgentName: { type: 'string' as const, description: 'For "manager" type — this agent becomes the subordinate (reports to agentName). For "collaborator" — the other peer.' },
          connectionType: { type: 'string' as const, description: 'Type of connection: "manager" (agentName manages targetAgentName) or "collaborator" (bidirectional peers)' }
        },
        required: ['agentName', 'targetAgentName', 'connectionType']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'remove_connection',
      description: 'Remove all connections between two agents — clears any manager/subordinate relationship and removes from collaborators on both sides.',
      parameters: {
        type: 'object' as const,
        properties: {
          agentName: { type: 'string' as const, description: 'Name of the first agent' },
          targetAgentName: { type: 'string' as const, description: 'Name of the second agent' }
        },
        required: ['agentName', 'targetAgentName']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'update_connection',
      description: 'Change the connection type between two agents. "manager": agentName manages targetAgentName. "collaborator": bidirectional. "none": remove all connections.',
      parameters: {
        type: 'object' as const,
        properties: {
          agentName: { type: 'string' as const, description: 'For "manager" type — this agent becomes the manager (boss). For "collaborator" — either agent.' },
          targetAgentName: { type: 'string' as const, description: 'For "manager" type — this agent becomes the subordinate (reports to agentName). For "collaborator" — the other peer.' },
          connectionType: { type: 'string' as const, description: 'New connection type: "manager", "collaborator", or "none"' }
        },
        required: ['agentName', 'targetAgentName', 'connectionType']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'resolve_approval',
      description: 'Approve or reject a pending approval request.',
      parameters: {
        type: 'object' as const,
        properties: {
          approvalId: { type: 'string' as const, description: 'ID of the approval request' },
          approved: { type: 'boolean' as const, description: 'true to approve, false to reject' }
        },
        required: ['approvalId', 'approved']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'request_approval',
      description: 'Request approval to continue. If approverAgentName is provided, the named agent will review. Otherwise, a human must approve.',
      parameters: {
        type: 'object' as const,
        properties: {
          taskTitle: { type: 'string' as const, description: 'Title or partial title of the task that needs approval' },
          action: { type: 'string' as const, description: 'What action or decision needs approval' },
          question: { type: 'string' as const, description: 'Short question for the reviewer' },
          risk: { type: 'string' as const, description: 'Must be: low, medium, high, or critical' },
          estimatedCost: { type: 'number' as const, description: 'Estimated cost or effort for the pending decision' },
          approverAgentName: { type: 'string' as const, description: 'Optional. Name of another agent to review this request. Leave empty for human approval.' },
          requiredPermission: { type: 'string' as const, description: 'Optional. Permission type you need, e.g. "file:write", "run_command". If set, this will be escalated to human for approval.' },
          permissionScope: { type: 'array' as const, items: { type: 'string' as const }, description: 'Optional. Path globs to limit permission scope, e.g. ["API/**"]. Only meaningful with requiredPermission.' }
        },
        required: ['taskTitle', 'action', 'question', 'risk', 'estimatedCost']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'respond_to_approval',
      description: 'Approve or reject a pending approval request that was sent to you by another agent.',
      parameters: {
        type: 'object' as const,
        properties: {
          approvalId: { type: 'string' as const, description: 'The approval ID to respond to.' },
          approved: { type: 'boolean' as const, description: 'true to approve, false to reject.' },
          reason: { type: 'string' as const, description: 'Optional reason for the decision.' }
        },
        required: ['approvalId', 'approved']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'search_tasks',
      description: 'Find tasks matching criteria.',
      parameters: {
        type: 'object' as const,
        properties: {
          status: { type: 'string' as const, description: 'Optional. Filter by status' },
          priority: { type: 'string' as const, description: 'Optional. Filter by priority' },
          tag: { type: 'string' as const, description: 'Optional. Filter by tag' },
          assigneeName: { type: 'string' as const, description: 'Optional. Filter by assigned agent name' }
        },
        required: []
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_task_details',
      description: 'Get full information about a task including comments, subtasks, and history.',
      parameters: {
        type: 'object' as const,
        properties: {
          taskTitle: { type: 'string' as const, description: 'Task title' }
        },
        required: ['taskTitle']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'send_broadcast',
      description: 'Send a message to connected agents that have Telegram bots. Requires system:broadcast permission.',
      parameters: {
        type: 'object' as const,
        properties: {
          message: { type: 'string' as const, description: 'Text to broadcast' }
        },
        required: ['message']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'send_telegram_message',
      description: 'Send a message via your Telegram bot. Defaults to the last known chat.',
      parameters: {
        type: 'object' as const,
        properties: {
          message: { type: 'string' as const, description: 'Message text to send via Telegram. Use standard Markdown for formatting.' },
          chatId: { type: 'string' as const, description: 'Optional. Telegram chat ID to send to. If omitted, sends to the last known chat.' }
        },
        required: ['message']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'send_message',
      description: 'Send a one-way message to a connected agent. The message is saved in their inbox for later reading. Does NOT wait for a reply — use ask_agent if you need an immediate response.',
      parameters: {
        type: 'object' as const,
        properties: {
          agentName: { type: 'string' as const, description: 'Name of the agent to message' },
          content: { type: 'string' as const, description: 'Your message to the agent' }
        },
        required: ['agentName', 'content']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'ask_agent',
      description: 'Ask a connected agent to do work and wait for their reply. The target agent gets full tool access and can call reply_to_message to respond. Waits up to 2 minutes. Use send_message for long-running tasks.',
      parameters: {
        type: 'object' as const,
        properties: {
          agentName: { type: 'string' as const, description: 'Name of the agent to ask' },
          content: { type: 'string' as const, description: 'Your request to the agent' }
        },
        required: ['agentName', 'content']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'reply_to_message',
      description: 'Reply to a message you received (from your inbox). The reply is delivered to the sender — via Telegram if they have a bot configured, otherwise stored in their inbox.',
      parameters: {
        type: 'object' as const,
        properties: {
          messageId: { type: 'string' as const, description: 'ID of the message you are replying to' },
          content: { type: 'string' as const, description: 'Your reply text' }
        },
        required: ['messageId', 'content']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'check_my_inbox',
      description: 'Show your pending incoming messages and the status of messages you sent.',
      parameters: {
        type: 'object' as const,
        properties: {},
        required: []
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'generate_report',
      description: 'Generate a textual summary report of the company state.',
      parameters: {
        type: 'object' as const,
        properties: {
          type: { type: 'string' as const, description: 'Must be: dashboard, agents, tasks, or costs' }
        },
        required: ['type']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'set_agent_personality',
      description: 'Update SOUL, IDENTITY, and/or ROLE files for an agent. Use after agent creation to define personality.',
      parameters: {
        type: 'object' as const,
        properties: {
          agentName: { type: 'string' as const, description: 'Name of the agent whose personality to update' },
          soul: { type: 'string' as const, description: 'Optional. SOUL.md content — core values, ethics, boundaries, priority framework.' },
          identity: { type: 'string' as const, description: 'Optional. IDENTITY.md content — personality traits, communication tone, behavioral patterns.' },
          role: { type: 'string' as const, description: 'Optional. ROLE.md content — responsibilities, expertise, authority, collaboration rules.' }
        },
        required: ['agentName']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'create_cron',
      description: 'Create a scheduled cron job. The agent will execute the prompt on the given schedule with full tool access.',
      parameters: {
        type: 'object' as const,
        properties: {
          name: { type: 'string' as const, description: 'Name of the cron job' },
          agentName: { type: 'string' as const, description: 'Name of the agent who will execute this cron job' },
          schedule: { type: 'string' as const, description: 'Cron expression. Examples: "*/30 * * * *" (every 30 min), "0 */6 * * *" (every 6 hours), "0 9 * * 1" (every Monday at 9am), "0 0 * * *" (daily at midnight)' },
          prompt: { type: 'string' as const, description: 'Natural language instruction for the agent. What should it do when the cron fires?' },
          description: { type: 'string' as const, description: 'Optional. Description of what this cron job does.' }
        },
        required: ['name', 'agentName', 'schedule', 'prompt']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'list_crons',
      description: 'List all cron jobs in the current workspace, with their statuses and last run results.',
      parameters: {
        type: 'object' as const,
        properties: {},
        required: []
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'delete_cron',
      description: 'Delete a cron job by name.',
      parameters: {
        type: 'object' as const,
        properties: {
          cronName: { type: 'string' as const, description: 'Name of the cron job to delete' }
        },
        required: ['cronName']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'update_cron',
      description: 'Update a cron job schedule, prompt, enabled state, or description.',
      parameters: {
        type: 'object' as const,
        properties: {
          cronName: { type: 'string' as const, description: 'Name of the cron job to update' },
          schedule: { type: 'string' as const, description: 'Optional. New cron expression' },
          prompt: { type: 'string' as const, description: 'Optional. New instruction for the agent' },
          enabled: { type: 'boolean' as const, description: 'Optional. Enable or disable the cron job' },
          description: { type: 'string' as const, description: 'Optional. New description' }
        },
        required: ['cronName']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'run_cron_now',
      description: 'Manually trigger a cron job to run immediately.',
      parameters: {
        type: 'object' as const,
        properties: {
          cronName: { type: 'string' as const, description: 'Name of the cron job to run now' }
        },
        required: ['cronName']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'run_command',
      description: 'Run a shell command inside the workspace Docker sandbox. Use detach=true for long-running dev servers. Commands may require approval depending on workspace policy.',
      parameters: {
        type: 'object' as const,
        properties: {
          command: { type: 'string' as const, description: 'Executable to run, e.g. "npm" or "git"' },
          args: { type: 'array' as const, items: { type: 'string' as const }, description: 'Optional command arguments' },
          cwd: { type: 'string' as const, description: 'Optional path relative to the workspace root' },
          env: { type: 'object' as const, additionalProperties: { type: 'string' as const }, description: 'Optional environment variables for the command' },
          timeoutMs: { type: 'number' as const, description: 'Optional timeout in milliseconds' },
          detach: { type: 'boolean' as const, description: 'Set true for long-running processes like npm run dev' }
        },
        required: ['command']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'read_file',
      description: 'Read the contents of a file in the workspace. Path is relative to the workspace root.',
      parameters: {
        type: 'object' as const,
        properties: {
          path: { type: 'string' as const, description: 'Relative path to the file, e.g. "src/index.ts" or "README.md"' },
          lines: { type: 'number' as const, description: 'Optional. Maximum approximate lines to return (default 2000). Content is truncated if it exceeds this.' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'write_file',
      description: 'Write content to a file in the workspace. Creates parent directories if they do not exist. Path is relative to the workspace root.',
      parameters: {
        type: 'object' as const,
        properties: {
          path: { type: 'string' as const, description: 'Relative path to the file, e.g. "src/config.ts"' },
          content: { type: 'string' as const, description: 'The full content to write to the file' }
        },
        required: ['path', 'content']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'delete_file',
      description: 'Delete a file in the workspace. Path is relative to the workspace root. Directories cannot be deleted this way.',
      parameters: {
        type: 'object' as const,
        properties: {
          path: { type: 'string' as const, description: 'Relative path to the file to delete, e.g. "temp/log.txt"' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'create_folder',
      description: 'Create a folder/directory in the workspace. Creates parent directories if they do not exist. Path is relative to the workspace root.',
      parameters: {
        type: 'object' as const,
        properties: {
          path: { type: 'string' as const, description: 'Relative path to the folder to create, e.g. "src/components"' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'delete_folder',
      description: 'Recursively delete a folder and all its contents in the workspace. Path is relative to the workspace root. Use with caution — this permanently removes all files and subdirectories.',
      parameters: {
        type: 'object' as const,
        properties: {
          path: { type: 'string' as const, description: 'Relative path to the folder to delete, e.g. "temp/old-files"' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'list_files',
      description: 'List files and directories in a workspace path. Shows names, types (file/directory), and file sizes.',
      parameters: {
        type: 'object' as const,
        properties: {
          path: { type: 'string' as const, description: 'Optional. Relative directory path to list. Defaults to workspace root (".").' }
        },
        required: []
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'create_role',
      description: 'Create a new role in the workspace. Roles group permissions together for assignment to agents. Requires system:manage_roles permission.',
      parameters: {
        type: 'object' as const,
        properties: {
          name: { type: 'string' as const, description: 'Role name, e.g. "Senior Developer"' },
          description: { type: 'string' as const, description: 'Optional. What this role is for.' }
        },
        required: ['name']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'delete_role',
      description: 'Delete a role from the workspace. The role is also revoked from all agents that had it. Requires system:manage_roles permission.',
      parameters: {
        type: 'object' as const,
        properties: {
          roleName: { type: 'string' as const, description: 'Name of the role to delete' }
        },
        required: ['roleName']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'update_role',
      description: 'Replace ALL permissions of a role at once. Use grant_permission_to_role / revoke_permission_from_role for incremental changes. Requires system:manage_roles permission.',
      parameters: {
        type: 'object' as const,
        properties: {
          roleName: { type: 'string' as const, description: 'Name of the role to update' },
          description: { type: 'string' as const, description: 'Optional. New description for the role.' },
          permissions: {
            type: 'array' as const,
            description: 'Full list of permissions for the role. Each item has "type" (permission type string) and optional "scope" (array of path globs, or omit for "all").',
            items: {
              type: 'object' as const,
              properties: {
                 type: { type: 'string' as const, description: 'Permission type, e.g. "file:read", "system:manage_crons".' },
                scope: { description: 'Path glob patterns, e.g. ["src/**", "docs/*.md"]. Omit for "all".' }
              },
              required: ['type']
            }
          }
        },
        required: ['roleName', 'permissions']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'grant_permission_to_role',
      description: 'Add (enrich) a single permission to a role without changing its other permissions. Requires system:manage_roles permission.',
      parameters: {
        type: 'object' as const,
        properties: {
          roleName: { type: 'string' as const, description: 'Name of the role to enrich' },
           permissionType: { type: 'string' as const, description: 'Permission type, e.g. "file:read", "system:manage_crons". Use list_permissions for all valid types.' },
           scope: { type: 'array' as const, items: { type: 'string' as const }, description: 'Path globs to limit scope, e.g. ["src/**"]. Omit for full access.' },
        },
        required: ['roleName', 'permissionType']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'revoke_permission_from_role',
      description: 'Remove a single permission from a role. Requires system:manage_roles permission.',
      parameters: {
        type: 'object' as const,
        properties: {
          roleName: { type: 'string' as const, description: 'Name of the role' },
          permissionType: { type: 'string' as const, description: 'Permission type to remove' }
        },
        required: ['roleName', 'permissionType']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'list_roles',
      description: 'List all roles in the current workspace with their permissions.',
      parameters: {
        type: 'object' as const,
        properties: {},
        required: []
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_role',
      description: 'Get detailed information about a specific role, including which agents have it.',
      parameters: {
        type: 'object' as const,
        properties: {
          roleName: { type: 'string' as const, description: 'Name of the role' }
        },
        required: ['roleName']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'assign_role',
      description: 'Assign a role to an agent, granting them all permissions defined in that role. Requires system:manage_permissions permission.',
      parameters: {
        type: 'object' as const,
        properties: {
          agentName: { type: 'string' as const, description: 'Name of the agent to receive the role' },
          roleName: { type: 'string' as const, description: 'Name of the role to assign' }
        },
        required: ['agentName', 'roleName']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'revoke_role',
      description: 'Remove a role from an agent. The agent loses all permissions that came from this role (unless they have them from other roles). Requires system:manage_permissions permission.',
      parameters: {
        type: 'object' as const,
        properties: {
          agentName: { type: 'string' as const, description: 'Name of the agent' },
          roleName: { type: 'string' as const, description: 'Name of the role to revoke' }
        },
        required: ['agentName', 'roleName']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_agent_permissions',
      description: 'View all effective permissions of an agent — aggregated from all their assigned roles.',
      parameters: {
        type: 'object' as const,
        properties: {
          agentName: { type: 'string' as const, description: 'Name of the agent' }
        },
        required: ['agentName']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'list_permissions',
      description: 'List all available permission types the system supports with descriptions.',
      parameters: {
        type: 'object' as const,
        properties: {},
        required: []
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'web_search',
      description: 'Search the internet. Returns title, URL, and snippet. Use fetch_url to read full page content.',
      parameters: {
        type: 'object' as const,
        properties: {
          query: { type: 'string' as const, description: 'Search query. Be specific and descriptive for best results. Include relevant keywords, dates, or domain names.' },
          num_results: { type: 'number' as const, description: 'Maximum number of results to return (default: 5, max: 10)' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'fetch_url',
      description: 'Fetch and read content from a URL. Strips HTML. Supports text/html, text/plain, application/json. Use after web_search to read full pages.',
      parameters: {
        type: 'object' as const,
        properties: {
          url: { type: 'string' as const, description: 'Full URL to fetch (must start with http:// or https://).' }
        },
        required: ['url']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'grant_permission_to_agent',
      description: 'Grant a specific permission directly to an agent (in addition to their role-based permissions). Use this to give an agent extra capabilities without modifying their roles. Requires system:manage_permissions permission.',
      parameters: {
        type: 'object' as const,
        properties: {
          agentName: { type: 'string' as const, description: 'Name of the agent to grant the permission to.' },
            permissionType: { type: 'string' as const, description: 'Permission type, e.g. "file:read", "system:manage_crons". Use list_permissions for all valid types.' },
           scope: { type: 'array' as const, items: { type: 'string' as const }, description: 'Path globs to limit scope, e.g. ["src/**"]. Omit for full access.' },
        },
        required: ['agentName', 'permissionType']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'revoke_permission_from_agent',
      description: 'Remove a specific permission that was granted directly to an agent. Does NOT affect permissions the agent has through their roles. Requires system:manage_permissions permission.',
      parameters: {
        type: 'object' as const,
        properties: {
          agentName: { type: 'string' as const, description: 'Name of the agent to revoke the permission from.' },
          permissionType: { type: 'string' as const, description: 'Permission type to revoke.' }
        },
        required: ['agentName', 'permissionType']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'install_skill',
      description: 'Install a skill onto an agent (yourself by default). Requires system:manage_skills to install on others.',
      parameters: {
        type: 'object' as const,
        properties: {
          agentName: { type: 'string' as const, description: 'Optional. Name of the agent to install skill on. Defaults to yourself if omitted.' },
          skillId: { type: 'string' as const, description: 'The skill ID in "org/name" format (e.g. "vercel-labs/react-best-practices", "stripe/stripe-best-practices")' }
        },
        required: ['skillId']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'uninstall_skill',
      description: 'Remove an installed skill from an agent (yourself by default). Requires system:manage_skills to uninstall from others.',
      parameters: {
        type: 'object' as const,
        properties: {
          agentName: { type: 'string' as const, description: 'Optional. Name of the agent to uninstall skill from. Defaults to yourself if omitted.' },
          skillId: { type: 'string' as const, description: 'The skill ID to remove (e.g. "vercel-labs/react-best-practices")' }
        },
        required: ['skillId']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'http_request',
      description: 'Make an HTTP request to an external API. Supports GET, POST, PUT, DELETE, PATCH. Private hosts blocked. Max response 500KB. Requires system:http_request permission.',
      parameters: {
        type: 'object' as const,
        properties: {
          method: { type: 'string' as const, description: 'HTTP method: GET, POST, PUT, DELETE, or PATCH.' },
          url: { type: 'string' as const, description: 'Full URL (must start with http:// or https://).' },
          headers: { type: 'object' as const, description: 'Optional. Request headers as key-value pairs.' },
          body: { type: 'string' as const, description: 'Optional. Request body as a string (use JSON.stringify() for JSON APIs).' },
          timeout: { type: 'number' as const, description: 'Optional. Timeout in milliseconds (default 15000, max 60000).' }
        },
        required: ['method', 'url']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'create_pipeline',
      description: 'Define a reusable pipeline with ordered stages. Each stage targets an agent role (Developer, Reviewer, etc.).',
      parameters: {
        type: 'object' as const,
        properties: {
          name: { type: 'string' as const, description: 'Pipeline name, e.g. "Dev → Review → Deploy"' },
          description: { type: 'string' as const, description: 'Optional. What this pipeline does.' },
          stages: {
            type: 'array' as const,
            description: 'Array of pipeline stages in execution order.',
            items: {
              type: 'object' as const,
              properties: {
                name: { type: 'string' as const, description: 'Stage name, e.g. "Development"' },
                 assigneeRole: { type: 'string' as const, description: 'Agent role for this stage (e.g. Developer, Reviewer, DevOps).' },
                instructions: { type: 'string' as const, description: 'What the agent should do in this stage.' },
                expectedOutput: { type: 'string' as const, description: 'Optional. What the stage should produce.' },
                transition: { type: 'string' as const, description: 'Optional. "auto" (next stage starts automatically), "approval_required" (waits for human approval), or "manual" (PM must trigger next stage). Default: auto.' },
                timeoutMinutes: { type: 'number' as const, description: 'Optional. Minutes before stage times out and escalates.' }
              },
              required: ['name', 'assigneeRole', 'instructions']
            }
          }
        },
        required: ['name', 'stages']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'start_pipeline',
      description: 'Launch a pipeline on a task. Runs stages sequentially, assigning work to agents by role. Use get_pipeline_status to track progress.',
      parameters: {
        type: 'object' as const,
        properties: {
          taskTitle: { type: 'string' as const, description: 'Title or partial title of the task to run the pipeline on.' },
          taskId: { type: 'string' as const, description: 'Optional. Exact task ID.' },
          pipelineName: { type: 'string' as const, description: 'Name or partial name of the pipeline to run.' },
          pipelineId: { type: 'string' as const, description: 'Optional. Exact pipeline ID.' }
        },
        required: ['taskTitle', 'pipelineName']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_pipeline_status',
      description: 'Check the status of a running or completed pipeline instance.',
      parameters: {
        type: 'object' as const,
        properties: {
          instanceId: { type: 'string' as const, description: 'Optional. Pipeline instance ID to check.' },
          pipelineId: { type: 'string' as const, description: 'Optional. Pipeline ID to list all instances for.' }
        },
        required: []
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'cancel_pipeline',
      description: 'Cancel a running or paused pipeline instance.',
      parameters: {
        type: 'object' as const,
        properties: {
          instanceId: { type: 'string' as const, description: 'Pipeline instance ID to cancel.' },
          reason: { type: 'string' as const, description: 'Optional. Reason for cancellation.' }
        },
        required: ['instanceId']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'list_pipelines',
      description: 'List all pipelines available in the current workspace with their stage count and active instances.',
      parameters: {
        type: 'object' as const,
        properties: {},
        required: []
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'plan_pipeline',
      description: 'Get a suggested pipeline stage plan for a task. Use returned stages with create_pipeline.',
      parameters: {
        type: 'object' as const,
        properties: {
          taskTitle: { type: 'string' as const, description: 'Title or partial title of the task.' },
          taskId: { type: 'string' as const, description: 'Optional. Exact task ID.' }
        },
        required: ['taskTitle']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'delete_pipeline',
      description: 'Delete a pipeline definition. Only works if the pipeline has no active instances.',
      parameters: {
        type: 'object' as const,
        properties: {
          pipelineId: { type: 'string' as const, description: 'Pipeline ID to delete.' }
        },
        required: ['pipelineId']
      }
    }
  }
];
