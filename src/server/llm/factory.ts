import type { Agent, LLMProvider as LLMProviderType } from '../../types';
import { getSettings } from '../lib/settings';
import { getProviderDefinition, PROVIDER_DEFS } from './registry';
import { OpenAICompatibleClient } from './providers/openai-compatible';
import { GoogleClient } from './providers/google';
import { ChatSessionWrapper } from './chat-session';
import type { ChatSession, LLMProviderClient } from './types';

export function createChatSession(agent: Agent, systemPrompt: string): ChatSession {
  const settings = getSettings();
  const providerId = agent.providerId || settings.defaultProviderId;
  const provider = providerId ? settings.providers?.[providerId] : null;

  if (!provider) {
    throw new Error(`No LLM provider configured. Please add a provider in Settings.`);
  }

  const def = getProviderDefinition(providerId);
  if (!def) {
    throw new Error(`Unknown provider: ${providerId}`);
  }

  const baseUrl = provider.baseUrl || def.baseUrl;
  const model = agent.model || provider.defaultModel || def.defaultModel;

  let client: LLMProviderClient;

  if (def.type === 'google') {
    client = new GoogleClient(provider.apiKey, baseUrl);
  } else {
    client = new OpenAICompatibleClient(provider.apiKey, baseUrl);
  }

  return new ChatSessionWrapper(client, systemPrompt, model);
}

export function getProviderClient(providerId: string): LLMProviderClient | null {
  const settings = getSettings();
  const provider = providerId ? settings.providers?.[providerId] : null;

  if (!provider) {
    return null;
  }

  const def = getProviderDefinition(providerId);
  if (!def) {
    return null;
  }

  const baseUrl = provider.baseUrl || def.baseUrl;

  if (def.type === 'google') {
    return new GoogleClient(provider.apiKey, baseUrl);
  } else {
    return new OpenAICompatibleClient(provider.apiKey, baseUrl);
  }
}

export async function testProvider(providerId: string): Promise<boolean> {
  const client = getProviderClient(providerId);
  if (!client) {
    return false;
  }
  return client.test();
}

export async function listProviderModels(providerId: string): Promise<string[]> {
  const client = getProviderClient(providerId);
  if (!client) {
    return [];
  }
  return client.listModels();
}

export function getProviderDef(id: string) {
  return PROVIDER_DEFS[id];
}

export function getAllProviderDefs() {
  return PROVIDER_DEFS;
}