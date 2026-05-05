import type { Agent } from '../../types';
import { getSettings } from '../lib/settings';
import { getProviderDefinition, PROVIDER_DEFS } from './registry';
import { OpenRouterClient } from './providers/openrouter';
import { OpenAICompatibleClient } from './providers/openai-compatible';
import { GoogleClient } from './providers/google';
import { ChatSessionWrapper } from './chat-session';
import { mutateStore } from '../store';
import { formatLlmUsage } from '../lib/llm-usage';
import type { ChatSession, ChatSessionOptions, LLMProviderClient } from './types';

export function createChatSession(agent: Agent, systemPrompt: string, options: ChatSessionOptions = {}): ChatSession {
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

  if (!provider.apiKey || provider.apiKey.trim().length === 0) {
    throw new Error(`Missing API key for LLM provider "${providerId}". Configure it in Settings before using Telegram or agent chat.`);
  }

  const baseUrl = provider.baseUrl || def.baseUrl;
  const model = agent.model || provider.defaultModel || def.defaultModel;

  const client = createClient(providerId, provider.apiKey, baseUrl);

  const onUsage = options.onUsage;

  const onResponse = options.onResponse || ((messages, response, llmModel) => {
    const funcNames = response.toolCalls?.map(c => c.function.name) || [];
    const usage = response.usage;
    const usageDetails = usage ? formatLlmUsage(usage) : null;
    const parts: string[] = [`Model: ${llmModel}`];
    if (funcNames.length > 0) parts.push(`Tools: ${funcNames.join(', ')}`);
    if (usageDetails) parts.push(usageDetails);

    mutateStore(s => {
      s.logs.unshift({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        agentId: agent.id,
        action: 'LLM Call',
        details: parts.join(' | '),
        type: 'info',
        source: 'llm',
        category: 'llm',
        workspaceId: agent.workspaceId,
        metadata: {
          model: llmModel,
          inputTokens: usage?.inputTokens,
          outputTokens: usage?.outputTokens,
          totalTokens: usage?.totalTokens,
          cachedTokens: usage?.cachedTokens,
          reasoningTokens: usage?.reasoningTokens,
          cost: usage?.cost,
          promptMessages: messages.map(m => ({
            role: m.role,
            content: m.content,
            tool_calls: m.tool_calls,
            name: m.name,
            tool_call_id: m.tool_call_id,
          })),
          responseContent: response.content,
          functionCalls: funcNames.length > 0 ? funcNames : undefined,
        },
      });
      if (s.logs.length > 100) s.logs = s.logs.slice(0, 100);
      if (typeof usage?.cost === 'number') {
        s.totalCost += usage.cost;
      }
    });
  });

  return new ChatSessionWrapper(client, systemPrompt, model, onUsage, onResponse);
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

  if (!provider.apiKey || provider.apiKey.trim().length === 0) {
    console.error(`[LLM] Missing API key for provider: ${providerId}`);
    return null;
  }

  const baseUrl = provider.baseUrl || def.baseUrl;
  console.log(`[LLM] Using baseUrl: ${baseUrl}`);

  return createClient(providerId, provider.apiKey, baseUrl);
}

export async function testProvider(providerId: string): Promise<boolean> {
  const settings = getSettings();
  const provider = providerId ? settings.providers?.[providerId] : null;
  if (!provider) {
    console.error(`[LLM] No provider config for: ${providerId}`);
    return false;
  }

  const def = getProviderDefinition(providerId);
  if (!def) {
    console.error(`[LLM] No provider definition for: ${providerId}`);
    return false;
  }

  if (!provider.apiKey || provider.apiKey.trim().length === 0) {
    console.error(`[LLM] Missing API key for provider: ${providerId}`);
    return false;
  }

  try {
    const client = createClient(providerId, provider.apiKey, provider.baseUrl || def.baseUrl);
    const model = provider.defaultModel || def.defaultModel;
    await client.chat(model, [{ role: 'user', content: 'ping' }]);
    return true;
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
