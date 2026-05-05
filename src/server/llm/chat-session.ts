import type { ChatMessage, ChatSession, ChatSessionOptions, LLMUsage, LLMResponse, ToolCall } from './types';
import { companyTools } from '../lib/tool-definitions';

export class ChatSessionWrapper implements ChatSession {
  private client: any;
  private systemPrompt: string;
  private messages: ChatMessage[] = [];
  private model: string;

  constructor(
    client: any,
    systemPrompt: string,
    model: string,
    private onUsage?: (usage: LLMUsage) => void,
    private onResponse?: (messages: ChatMessage[], response: LLMResponse, model: string) => void
  ) {
    this.client = client;
    this.systemPrompt = systemPrompt;
    this.model = model;
  }

  async sendMessage(text: string): Promise<{ text: string; toolCalls?: ToolCall[]; usage?: LLMUsage }> {
    this.messages.push({ role: 'user', content: text });
    return this.callApi();
  }

  async sendToolResults(toolCalls: ToolCall[], results: unknown[]): Promise<{ text: string; toolCalls?: ToolCall[]; usage?: LLMUsage }> {
    for (let i = 0; i < toolCalls.length; i++) {
      this.messages.push({
        role: 'tool',
        tool_call_id: toolCalls[i].id,
        content: JSON.stringify(results[i]),
      });
    }
    return this.callApi();
  }

  private async callApi(): Promise<{ text: string; toolCalls?: ToolCall[]; usage?: LLMUsage }> {
    const messagesWithSystem: ChatMessage[] = [
      { role: 'system', content: this.systemPrompt },
      ...this.messages,
    ];

    const response = await this.client.chat(
      this.model,
      messagesWithSystem,
      companyTools,
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
