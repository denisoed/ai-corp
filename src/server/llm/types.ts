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

export interface LLMUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cachedTokens?: number;
  reasoningTokens?: number;
  cost?: number;
}

export interface LLMResponse {
  content: string;
  toolCalls?: ToolCall[];
  usage?: LLMUsage;
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
  description?: string;
}

export interface ChatSession {
  sendMessage(text: string): Promise<{ text: string; toolCalls?: ToolCall[]; usage?: LLMUsage }>;
  sendToolResults(toolCalls: ToolCall[], results: unknown[]): Promise<{ text: string; toolCalls?: ToolCall[]; usage?: LLMUsage }>;
  getMessages(): ChatMessage[];
}

export interface ChatSessionOptions {
  onUsage?: (usage: LLMUsage) => void;
  onResponse?: (messages: ChatMessage[], response: LLMResponse, model: string) => void;
  initialMessages?: ChatMessage[];
}
