import type { ProviderDefinition } from './types';

export const PROVIDER_DEFS: Record<string, ProviderDefinition> = {
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-4o',
    type: 'openai-compatible',
    description: 'Aggregated API for 200+ AI models from various providers',
  },
  // openai: {
  //   id: 'openai',
  //   name: 'OpenAI',
  //   baseUrl: 'https://api.openai.com/v1',
  //   defaultModel: 'gpt-5.4',
  //   type: 'openai-compatible',
  //   description: 'OpenAI GPT models',
  // },
  // deepseek: {
  //   id: 'deepseek',
  //   name: 'DeepSeek',
  //   baseUrl: 'https://api.deepseek.com',
  //   defaultModel: 'deepseek-v4-flash',
  //   type: 'openai-compatible',
  //   description: 'DeepSeek models',
  // },
  // minimax: {
  //   id: 'minimax',
  //   name: 'MiniMax',
  //   baseUrl: 'https://api.minimax.io/v1',
  //   defaultModel: 'MiniMax-M2.7',
  //   type: 'openai-compatible',
  //   description: 'MiniMax models',
  // },
  // kimi: {
  //   id: 'kimi',
  //   name: 'Kimi',
  //   baseUrl: 'https://api.moonshot.ai/v1',
  //   defaultModel: 'kimi-k2.5',
  //   type: 'openai-compatible',
  //   description: 'Kimi models',
  // },
  // gemini: {
  //   id: 'gemini',
  //   name: 'Gemini',
  //   baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
  //   defaultModel: 'gemini-2.5-flash',
  //   type: 'google',
  //   description: 'Google Gemini models',
  // },
};

export function getProviderDefinition(id: string): ProviderDefinition | undefined {
  return PROVIDER_DEFS[id];
}

export function getAllProviderIds(): string[] {
  return Object.keys(PROVIDER_DEFS);
}
