import type { ChatMessage, LLMProviderClient, LLMResponse, Tool, ToolCall } from '../types';

export abstract class AIBaseClient implements LLMProviderClient {
  protected apiKey: string;
  protected baseUrl: string;

  constructor(apiKey: string, baseUrl: string) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  abstract chat(
    model: string,
    messages: ChatMessage[],
    tools?: Tool[],
    toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } }
  ): Promise<LLMResponse>;

  abstract listModels(): Promise<string[]>;

  abstract test(): Promise<boolean>;

  protected async request<T>(path: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers = this.buildHeaders();

    const response = await fetch(url, {
      ...options,
      headers: {
        ...headers,
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Error ${response.status}: ${errorText}`);
    }

    return response.json();
  }

  protected buildHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
    };
  }
}