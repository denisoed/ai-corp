import type { ProviderDefinition } from './types';

export const PROVIDER_DEFS: Record<string, ProviderDefinition> = {
  opencode: {
    id: 'opencode',
    name: 'OpenCode',
    baseUrl: 'https://opencode.ai/zen/v1',
    defaultModel: 'gpt-5.4-mini',
    type: 'openai-compatible',
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-5.4',
    type: 'openai-compatible',
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-v4-flash',
    type: 'openai-compatible',
  },
  minimax: {
    id: 'minimax',
    name: 'MiniMax',
    baseUrl: 'https://api.minimax.io/v1',
    defaultModel: 'MiniMax-M2.7',
    type: 'openai-compatible',
  },
  kimi: {
    id: 'kimi',
    name: 'Kimi',
    baseUrl: 'https://api.moonshot.ai/v1',
    defaultModel: 'kimi-k2.5',
    type: 'openai-compatible',
  },
  gemini: {
    id: 'gemini',
    name: 'Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-2.5-flash',
    type: 'google',
  },
};

export function getProviderDefinition(id: string): ProviderDefinition | undefined {
  return PROVIDER_DEFS[id];
}

export function getAllProviderIds(): string[] {
  return Object.keys(PROVIDER_DEFS);
}