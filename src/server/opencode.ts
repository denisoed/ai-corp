import { companyTools } from './lib/tool-definitions';

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

export { companyTools };

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
