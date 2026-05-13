import { AIBaseClient } from './base';
import type { ChatMessage, LLMResponse, Tool, ToolCall } from '../types';

interface CachedModels {
  models: string[];
  timestamp: number;
}

export class OpenRouterClient extends AIBaseClient {
  private cache: Map<string, CachedModels> = new Map();
  private cacheTTL = 5 * 60 * 1000;

  protected buildHeaders(): Record<string, string> {
    return {
      ...super.buildHeaders(),
      'HTTP-Referer': process.env.OPENROUTER_HTTP_REFERER || 'http://localhost:3001',
      'X-OpenRouter-Title': process.env.OPENROUTER_APP_TITLE || 'AI Corp',
    };
  }

  async chat(
    model: string,
    messages: ChatMessage[],
    tools?: Tool[],
    toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } }
  ): Promise<LLMResponse> {
    const systemMessage = messages.find(m => m.role === 'system');
    const filteredMessages = messages.filter(m => m.role !== 'system');

    const body: Record<string, unknown> = {
      model,
      messages: systemMessage
        ? [{ role: 'system', content: systemMessage.content }, ...filteredMessages]
        : filteredMessages,
    };

    if (tools && tools.length > 0) {
      body.tools = tools;
      body.tool_choice = toolChoice || 'auto';
    }

    body.transforms = ['middle-out'];

    const response = await this.request<{
      choices: Array<{
        message: {
          content: string | null;
          tool_calls?: ToolCall[];
        };
      }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
        prompt_tokens_details?: {
          cached_tokens?: number;
        };
        completion_tokens_details?: {
          reasoning_tokens?: number;
        };
        cost?: number;
      };
    }>('/chat/completions', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    const message = response.choices?.[0]?.message;

    if (!message) {
      throw new Error('Empty response from LLM API');
    }

    return {
      content: message.content || '',
      toolCalls: message.tool_calls,
      usage: response.usage ? {
        inputTokens: response.usage.prompt_tokens,
        outputTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens,
        cachedTokens: response.usage.prompt_tokens_details?.cached_tokens,
        reasoningTokens: response.usage.completion_tokens_details?.reasoning_tokens,
        cost: response.usage.cost,
      } : undefined,
    };
  }

  async listModels(forceRefresh = false): Promise<string[]> {
    const cached = this.cache.get(this.baseUrl);

    if (!forceRefresh && cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.models;
    }

    try {
      const response = await this.request<{
        data: Array<{ id: string }>;
      }>('/models');

      const models = response.data?.map(m => m.id) || [];

      this.cache.set(this.baseUrl, {
        models,
        timestamp: Date.now(),
      });

      return models;
    } catch (e) {
      console.warn('[OpenRouterClient] Failed to list models:', e);
      return cached?.models || [];
    }
  }

  async test(): Promise<boolean> {
    try {
      await this.request<{ data: unknown }>('/models');
      return true;
    } catch {
      return false;
    }
  }
}
