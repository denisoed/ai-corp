import type { ChatMessage, ChatSession, ChatSessionOptions, LLMUsage, LLMResponse, ToolCall, Tool } from './types';
import { truncateToolResult } from '../lib/tool-result-truncation';

const MAX_CONTEXT_TOKENS = 8000;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

const IDEMPOTENT_READ_TOOLS = new Set([
  'read_file', 'list_files', 'get_company_state', 'get_task_details',
  'get_agent_details', 'search_tasks', 'check_my_inbox', 'list_roles',
  'list_crons', 'list_pipelines', 'list_subscriptions',
]);

export class ChatSessionWrapper implements ChatSession {
  private client: any;
  private systemPrompt: string;
  private messages: ChatMessage[] = [];
  private model: string;
  private tools: Tool[];
  private lastToolCallKey: string | null = null;

  constructor(
    client: any,
    systemPrompt: string,
    model: string,
    tools: Tool[],
    private onUsage?: (usage: LLMUsage) => void,
    private onResponse?: (messages: ChatMessage[], response: LLMResponse, model: string) => void,
    initialMessages?: ChatMessage[]
  ) {
    this.client = client;
    this.systemPrompt = systemPrompt;
    this.model = model;
    this.tools = tools;
    if (initialMessages && initialMessages.length > 0) {
      this.messages = initialMessages.map(m => ({
        role: m.role,
        content: m.content,
      }));
    }
  }

  async sendMessage(text: string): Promise<{ text: string; toolCalls?: ToolCall[]; usage?: LLMUsage }> {
    this.messages.push({ role: 'user', content: text });
    return this.callApi();
  }

  async sendToolResults(toolCalls: ToolCall[], results: unknown[]): Promise<{ text: string; toolCalls?: ToolCall[]; usage?: LLMUsage }> {
    for (let i = 0; i < toolCalls.length; i++) {
      const name = toolCalls[i].function.name;
      const truncated = truncateToolResult(name, results[i]);

      const callKey = `${name}:${toolCalls[i].function.arguments}`;
      if (this.lastToolCallKey === callKey && IDEMPOTENT_READ_TOOLS.has(name)) {
        this.messages.push({
          role: 'tool',
          tool_call_id: toolCalls[i].id,
          content: JSON.stringify({ _dedup: true, message: `Same ${name} call as previous turn — result unchanged.` }),
        });
        continue;
      }
      this.lastToolCallKey = callKey;

      this.messages.push({
        role: 'tool',
        tool_call_id: toolCalls[i].id,
        content: JSON.stringify(truncated),
      });
    }
    return this.callApi();
  }

  getMessages(): ChatMessage[] {
    return this.messages;
  }

  private trimMessages(): void {
    let totalTokens = 0;
    for (const m of this.messages) {
      totalTokens += estimateTokens(m.content);
      if (m.tool_calls) {
        for (const tc of m.tool_calls) {
          totalTokens += estimateTokens(tc.function.name + tc.function.arguments);
        }
      }
    }

    while (this.messages.length > 4 && totalTokens > MAX_CONTEXT_TOKENS) {
      const removed = this.messages.splice(1, 1)[0];
      totalTokens -= estimateTokens(removed.content);
      if (removed.tool_calls) {
        for (const tc of removed.tool_calls) {
          totalTokens -= estimateTokens(tc.function.name + tc.function.arguments);
        }
      }
    }
  }

  private async callApi(): Promise<{ text: string; toolCalls?: ToolCall[]; usage?: LLMUsage }> {
    this.trimMessages();
    const messagesWithSystem: ChatMessage[] = [
      { role: 'system', content: this.systemPrompt },
      ...this.messages,
    ];

    const response = await this.client.chat(
      this.model,
      messagesWithSystem,
      this.tools,
      'auto'
    );

    this.messages.push({
      role: 'assistant',
      content: response.content,
      tool_calls: response.toolCalls,
    });

    if (response.usage && this.onUsage) {
      this.onUsage(response.usage);
    }

    if (this.onResponse) {
      this.onResponse(messagesWithSystem, response, this.model);
    }

    return { text: response.content, toolCalls: response.toolCalls, usage: response.usage };
  }
}
