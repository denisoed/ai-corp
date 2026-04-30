import type { Agent } from '../../types';
import { getSettings } from '../lib/settings';
import { getProviderDefinition, PROVIDER_DEFS } from './registry';
import { OpenRouterClient } from './providers/openrouter';
import { OpenAICompatibleClient } from './providers/openai-compatible';
import { GoogleClient } from './providers/google';
import { ChatSessionWrapper } from './chat-session';
import type { ChatSession, LLMProviderClient } from './types';

export function createChatSession(agent: Agent, systemPrompt: string): ChatSession {
  const settings = getSettings();
  const providerId = agent.providerId || settings.defaultProviderId || 'openrouter';
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

  const client = createClient(providerId, provider.apiKey, baseUrl);

  return new ChatSessionWrapper(client, systemPrompt, model);
}

export function createClient(
  providerId: string,
  apiKey: string,
  baseUrl: string
): LLMProviderClient {
  const def = getProviderDefinition(providerId);

  if (!def) {
    throw new Error(`Unknown provider: ${providerId}`);
  }

  if (providerId === 'openrouter') {
    return new OpenRouterClient(apiKey, baseUrl);
  }

  if (def.type === 'google') {
    return new GoogleClient(apiKey, baseUrl);
  }

  return new OpenAICompatibleClient(apiKey, baseUrl);
}

export function getProviderClient(providerId: string): LLMProviderClient | null {
  const settings = getSettings();
  const provider = providerId ? settings.providers?.[providerId] : null;

  console.log(`[LLM] getProviderClient: ${providerId}, provider exists: ${!!provider}, apiKey: ${provider?.apiKey ? 'set' : 'empty'}`);

  if (!provider) {
    console.error(`[LLM] No provider config for: ${providerId}`);
    return null;
  }

  const def = getProviderDefinition(providerId);
  if (!def) {
    console.error(`[LLM] No provider definition for: ${providerId}`);
    return null;
  }

  const baseUrl = provider.baseUrl || def.baseUrl;
  console.log(`[LLM] Using baseUrl: ${baseUrl}`);

  return createClient(providerId, provider.apiKey, baseUrl);
}

export async function testProvider(providerId: string): Promise<boolean> {
  console.log(`[LLM] Testing provider: ${providerId}`);
  const client = getProviderClient(providerId);
  if (!client) {
    console.error(`[LLM] No client for provider: ${providerId}`);
    return false;
  }
  try {
    const result = await client.test();
    console.log(`[LLM] Provider test result for ${providerId}: ${result}`);
    return result;
  } catch (e) {
    console.error(`[LLM] Provider test error for ${providerId}:`, e);
    return false;
  }
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