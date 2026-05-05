import { EVENT_DEFINITIONS } from '../event-registry';

const eventTypeDescription = EVENT_DEFINITIONS
  .map(def => `${def.type} - ${def.description}`)
  .join('; ');

export const companyTools = [
  {
    type: 'function' as const,
    function: {
      name: 'create_agent',
      description: 'Hire/Onboard a new AI agent into the company. You can only create agents under a manager you are connected to (manager/subordinate or collaborator). Use soul/identity/roleDoc params to define their personality directly.',
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
      description: 'Create a new task on the Kanban board. You can only assign tasks to agents you have a relationship with (manager/subordinate or collaborator).',
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
      description: 'Get details of agents and tasks. When focus="agents", only agents connected to you are shown. ALWAYS present the complete list to the user — do NOT summarize or count. When asked about agents, list each agent with name, role, and status on separate bullet lines. When asked about tasks, list each task with title, status, and assignee.',
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
      description: 'Assign or reassign a task to a specific agent by name. You can only assign tasks to agents you have a relationship with (manager/subordinate or collaborator).',
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
      description: 'Add a comment or note to an existing task. You can only comment on tasks assigned to agents you are connected to (manager/subordinate or collaborator). Unassigned tasks can be commented on by any agent.',
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
          eventType: { type: 'string' as const, description: `Optional. Supported event types: ${eventTypeDescription}` },
          taskTitle: { type: 'string' as const, description: 'Optional. Title or partial title of the task to watch when subscribing to task events' },
          taskId: { type: 'string' as const, description: 'Optional. Exact task id to watch when subscribing to task events' },
          channel: { type: 'string' as const, description: 'Optional. telegram or in_app (default: telegram)' },
          instructions: { type: 'string' as const, description: 'Optional. Extra wording to include in the notification, like "give me a short summary".' }
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
          role: { type: 'string' as const, description: 'Optional. Must be: Manager, Developer, Analyst, Reviewer, Designer, DevOps, Research' },
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
      description: 'Get detailed information about a specific agent — their role, skills, tasks, and your connection to them (manager, subordinate, collaborator, or none).',
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
      description: 'List all agents you are connected to — your manager, your subordinates, and your collaborators. Use this to know who you can interact with.',
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
      description: 'Create a connection between two agents. Use "manager" to make agentName the manager of targetAgentName (targetAgentName will report to agentName). Use "collaborator" for bidirectional peer collaboration. IMPORTANT: to make Bob report to Alice, set agentName="Alice", targetAgentName="Bob", connectionType="manager". The MANAGER is always agentName, the SUBORDINATE is always targetAgentName.',
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
      description: 'Change the type of connection between two agents. Removes existing connection first, then applies the new type. Use "manager" to make agentName the manager of targetAgentName. Use "collaborator" for bidirectional peers. Use "none" to just remove all connections. IMPORTANT: the MANAGER is agentName, the SUBORDINATE is targetAgentName.',
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
      description: 'Create a pending approval request when the agent needs human confirmation to continue the current task.',
      parameters: {
        type: 'object' as const,
        properties: {
          taskTitle: { type: 'string' as const, description: 'Title or partial title of the task that needs approval' },
          action: { type: 'string' as const, description: 'What action or decision needs approval' },
          question: { type: 'string' as const, description: 'Short question for the human reviewer' },
          risk: { type: 'string' as const, description: 'Must be: low, medium, high, or critical' },
          estimatedCost: { type: 'number' as const, description: 'Estimated cost or effort for the pending decision' }
        },
        required: ['taskTitle', 'action', 'question', 'risk', 'estimatedCost']
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
      description: 'Send a message to agents that have Telegram bots configured. Only agents connected to you (manager/subordinate or collaborator) will receive the broadcast.',
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
      description: 'Send a message directly to a Telegram chat using your bot. Use this to notify users of cron job results, report updates, or any important information. The chat ID defaults to the last known chat if not provided.',
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
      description: "Update an agent's SOUL, IDENTITY, and/or ROLE files. Use after creating a new agent to configure their personality, or to refine an existing agent's behavior.",
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
      description: 'Create a scheduled cron job for an agent. The agent will execute the prompt on the given schedule using its AI capabilities and tools.',
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
      description: 'Update a cron job — change its schedule, prompt, enable/disable it.',
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
      description: 'Manually trigger a cron job to run immediately (for testing or ad-hoc execution).',
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
                type: { type: 'string' as const, description: 'Permission type: file:read, file:write, file:delete, file:list, system:manage_agents, system:manage_permissions, system:manage_roles, system:manage_crons, system:broadcast' },
                scope: { description: 'Array of path glob patterns for file permissions (e.g. ["src/**", "docs/*.md"]), or omit for "all"' }
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
          permissionType: { type: 'string' as const, description: 'Permission type to add: file:read, file:write, file:delete, file:list, system:manage_agents, system:manage_permissions, system:manage_roles, system:manage_crons, system:broadcast' },
          scope: { type: 'array' as const, items: { type: 'string' as const }, description: 'Optional. Array of path globs to limit scope. Omit for full access ("all").' }
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
      description: 'Search the internet for current information, news, documentation, and data. Returns results with title, URL, and snippet. Use this to research topics, find documentation, monitor trends, or gather market intelligence. To read the full content of a result, use fetch_url on its URL.',
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
      description: 'Fetch and read the content of a web page. Returns the text content of the page with HTML stripped. Use this after web_search to read full articles, documentation pages, or any specific URL in detail. Supports text/html, text/plain, and application/json content types.',
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
           permissionType: { type: 'string' as const, description: 'Permission type to grant: file:read, file:write, file:delete, file:list, system:manage_agents, system:manage_permissions, system:manage_roles, system:manage_crons, system:broadcast, system:web_search, system:fetch_url, system:http_request' },
          scope: { type: 'array' as const, items: { type: 'string' as const }, description: 'Optional. Array of path globs to limit scope. Omit for full access ("all"). Only meaningful for file:* permissions.' }
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
      description: 'Install a skill from the skills catalog onto an agent (yourself by default). Skills provide specialized knowledge for frameworks, tools, and platforms. Requires system:manage_skills permission to install on other agents.',
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
      description: 'Remove an installed skill from an agent (yourself by default). Requires system:manage_skills permission to uninstall from other agents.',
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
      description: 'Make an arbitrary HTTP request to any external API. Supports GET, POST, PUT, DELETE, and PATCH methods. Use this to interact with external services (GitHub, Slack, Jira, Stripe, etc.). Private/internal hosts are blocked for security. Maximum response size is 500KB. Requires system:http_request permission.',
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
  }
];
