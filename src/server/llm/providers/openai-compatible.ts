import type { ChatMessage, LLMProviderClient, LLMResponse, Tool, ToolCall } from '../types';

export class OpenAICompatibleClient implements LLMProviderClient {
  protected apiKey: string;
  protected baseUrl: string;

  constructor(apiKey: string, baseUrl: string) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  async chat(
    model: string,
    messages: ChatMessage[],
    tools?: Tool[],
    toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } }
  ): Promise<LLMResponse> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: messages.filter(m => m.role !== 'system'),
        ...(messages.find(m => m.role === 'system') && {
          messages: [
            { role: 'system', content: messages.find(m => m.role === 'system')!.content },
            ...messages.filter(m => m.role !== 'system'),
          ],
        }),
        ...(tools && { tools, tool_choice: toolChoice || 'auto' }),
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`LLM API Error ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const message = data.choices?.[0]?.message;

    if (!message) {
      throw new Error('Empty response from LLM API');
    }

    return {
      content: message.content || '',
      toolCalls: message.tool_calls,
    };
  }

  async listModels(): Promise<string[]> {
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      if (!res.ok) {
        console.warn('[OpenAICompatibleClient] Failed to list models:', res.status);
        return [];
      }

      const data = await res.json();
      return data.data?.map((m: { id: string }) => m.id) || [];
    } catch (e) {
      console.warn('[OpenAICompatibleClient] Failed to list models:', e);
      return [];
    }
  }

  async test(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

export class DeepSeekClient extends OpenAICompatibleClient {}
export class MiniMaxClient extends OpenAICompatibleClient {}
export class KimiClient extends OpenAICompatibleClient {}
export class OpenAIClient extends OpenAICompatibleClient {}
export class OpenCodeClient extends OpenAICompatibleClient {}