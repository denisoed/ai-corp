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
      description: 'Hire/Onboard a new AI agent into the company.',
      parameters: {
        type: 'object' as const,
        properties: {
          name: { type: 'string' as const, description: 'Name of the agent' },
          model: { type: 'string' as const, description: 'Model to use (e.g. GPT 5.4 Mini)' },
          role: { type: 'string' as const, description: 'Role (Must be one of: Manager, Developer, Analyst, Reviewer, Designer, DevOps, Research)' },
          description: { type: 'string' as const, description: 'Description of responsibilities' },
          skills: { type: 'array' as const, items: { type: 'string' as const }, description: 'List of skills' },
          managerName: { type: 'string' as const, description: 'Optional. The name of the manager agent they report to.' }
        },
        required: ['name', 'model', 'role', 'description', 'skills']
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
