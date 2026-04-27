const OPENCODE_API_KEY = process.env.OPENCODE_API_KEY;
const OPENCODE_BASE_URL = process.env.OPENCODE_API_BASE_URL || 'https://opencode.ai/zen/v1';
const OPENCODE_MODEL = process.env.OPENCODE_MODEL || 'gpt-5.4-mini';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface ApiResponse {
  choices: Array<{
    message: ChatMessage;
  }>;
}

export const companyTools = [
  {
    type: 'function' as const,
    function: {
      name: 'create_agent',
      description: 'Hire/Onboard a new AI agent into the company. Use soul/identity/roleDoc params to define their personality directly.',
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
      description: 'Create a new task on the Kanban board.',
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
      description: 'Get a summary of the current agents and tasks in the company to help answer user questions.',
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
      description: 'Assign or reassign a task to a specific agent by name.',
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
      description: 'Add a comment or note to an existing task.',
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
      description: 'Get detailed information about a specific agent and their current workload.',
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
      name: 'toggle_autopilot',
      description: 'Enable or disable the autonomous orchestrator.',
      parameters: {
        type: 'object' as const,
        properties: {}
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
      description: 'Send a message to all agents that have Telegram bots configured.',
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
  }
];

export class OpenCodeChatSession {
  private messages: ChatMessage[] = [];
  private systemInstruction: string;

  constructor(systemInstruction: string) {
    this.systemInstruction = systemInstruction;
  }

  async sendMessage(text: string): Promise<{ text: string; toolCalls?: ToolCall[] }> {
    this.messages.push({ role: 'user', content: text });
    return this.callApi();
  }

  async sendToolResults(toolCalls: ToolCall[], results: any[]): Promise<{ text: string; toolCalls?: ToolCall[] }> {
    for (let i = 0; i < toolCalls.length; i++) {
      this.messages.push({
        role: 'tool',
        tool_call_id: toolCalls[i].id,
        content: JSON.stringify(results[i])
      });
    }
    return this.callApi();
  }

  private async callApi(): Promise<{ text: string; toolCalls?: ToolCall[] }> {
    if (!OPENCODE_API_KEY) {
      throw new Error('OPENCODE_API_KEY is not configured');
    }

    const res = await fetch(`${OPENCODE_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENCODE_API_KEY}`
      },
      body: JSON.stringify({
        model: OPENCODE_MODEL,
        messages: [
          { role: 'system', content: this.systemInstruction },
          ...this.messages
        ],
        tools: companyTools,
        tool_choice: 'auto'
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenCode API Error: ${res.status} ${errText}`);
    }

    const data: ApiResponse = await res.json();
    const message = data.choices[0]?.message;

    if (!message) {
      throw new Error('Empty response from OpenCode API');
    }

    this.messages.push(message);

    if (message.tool_calls && message.tool_calls.length > 0) {
      return { text: message.content || '', toolCalls: message.tool_calls };
    }

    return { text: message.content || '' };
  }
}

export async function callOpenCodeCompletion(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  if (!OPENCODE_API_KEY) {
    throw new Error('OPENCODE_API_KEY is not configured');
  }

  const res = await fetch(`${OPENCODE_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENCODE_API_KEY}`
    },
    body: JSON.stringify({
      model: OPENCODE_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenCode API Error: ${res.status} ${errText}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('Empty response from OpenCode API');
  }
  return content;
}

const KEEP_AFTER_SUMMARIZE = 5;

export async function summarizeAgentMemory(
  memory: import('../types').AgentMemory
): Promise<import('../types').AgentMemory> {
  const now = new Date().toISOString();

  const messagesToKeep = memory.recentMessages.slice(-KEEP_AFTER_SUMMARIZE);
  const messagesToSummarize = memory.recentMessages.slice(0, -KEEP_AFTER_SUMMARIZE);

  if (messagesToSummarize.length === 0) return memory;

  const messagesText = messagesToSummarize
    .map(m => `[${m.role}${m.source ? `:${m.source}` : ''}]: ${m.content}`)
    .join('\n');

  const currentSummary = memory.summary || '(empty)';
  const currentFacts = memory.keyFacts.length > 0
    ? memory.keyFacts.join('\n- ')
    : '(empty)';

  const systemPrompt = `You are a memory summarizer for an AI agent.
Summarize the conversation messages below. Extract ONLY:
- Key decisions that were made
- Important facts and context (project names, file paths, technologies, configurations)
- Active tasks and their statuses
- Deadlines and priorities mentioned
- Names of people, agents, or systems referenced
- Any warnings, errors, or issues that need attention

Keep your output concise. Discard small talk, repetition, and intermediate reasoning.`;

  const userPrompt = `CURRENT SUMMARY:
${currentSummary}

CURRENT KEY FACTS:
- ${currentFacts}

MESSAGES TO SUMMARIZE:
${messagesText}

Respond ONLY with a JSON object (no markdown, no code block):
{
  "newSummary": "A concise updated summary merging old summary with new information. Include what the agent is currently doing, recent decisions, and important context. Maximum 500 words.",
  "newFacts": ["fact string 1", "fact string 2"],
  "activeTasks": [{"title": "task name", "status": "In Progress"}]
}`;

  let result: { newSummary: string; newFacts: string[]; activeTasks: { title: string; status: string }[] };

  try {
    const response = await callOpenCodeCompletion(systemPrompt, userPrompt);
    let jsonStr = response.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }
    result = JSON.parse(jsonStr);

    if (!result.newSummary || !Array.isArray(result.newFacts)) {
      throw new Error('Invalid summarization response structure');
    }
  } catch (e) {
    console.error('[Memory Summarizer] LLM summarization failed, using fallback:', e);
    result = {
      newSummary: currentSummary,
      newFacts: memory.keyFacts,
      activeTasks: memory.activeTasks
    };
  }

  const factSet = new Set([...memory.keyFacts, ...result.newFacts]);
  const mergedFacts = Array.from(factSet).slice(-20);

  const updatedMemory: import('../types').AgentMemory = {
    ...memory,
    summary: result.newSummary.slice(0, 2000),
    keyFacts: mergedFacts,
    activeTasks: result.activeTasks || memory.activeTasks,
    recentMessages: messagesToKeep,
    lastSummarizedAt: now,
  };

  return updatedMemory;
}
