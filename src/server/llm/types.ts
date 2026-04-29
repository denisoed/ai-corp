import type { Agent, LLMProvider } from '../../types';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface Tool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface LLMResponse {
  content: string;
  toolCalls?: ToolCall[];
}

export interface LLMProviderClient {
  chat(
    model: string,
    messages: ChatMessage[],
    tools?: Tool[],
    toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } }
  ): Promise<LLMResponse>;

  listModels(): Promise<string[]>;

  test(): Promise<boolean>;
}

export interface ProviderDefinition {
  id: string;
  name: string;
  baseUrl: string;
  defaultModel: string;
  type: 'openai-compatible' | 'google';
}

export interface ChatSession {
  sendMessage(text: string): Promise<{ text: string; toolCalls?: ToolCall[] }>;
  sendToolResults(toolCalls: ToolCall[], results: unknown[]): Promise<{ text: string; toolCalls?: ToolCall[] }>;
}