import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as settingsModule from '../../../src/server/lib/settings';
import { createChatSession, getProviderClient } from '../../../src/server/llm/factory';

describe('llm factory', () => {
  beforeEach(() => {
    vi.spyOn(settingsModule, 'getSettings').mockReset();
  });

  it('rejects chat session creation when provider api key is missing', () => {
    vi.spyOn(settingsModule, 'getSettings').mockReturnValue({
      defaultProviderId: 'openrouter',
      providers: {
        openrouter: {
          id: 'openrouter',
          name: 'OpenRouter',
          apiKey: '',
          defaultModel: 'openai/gpt-4o',
          enabled: true,
        },
      },
    });

    expect(() => createChatSession({
      id: 'agent-1',
      name: 'Bot',
      slug: 'bot',
      status: 'Idle',
      skills: [],
      workspaceId: 'ws-1',
    }, 'system prompt')).toThrowError(/Missing API key/i);
  });

  it('returns null provider client when api key is missing', () => {
    vi.spyOn(settingsModule, 'getSettings').mockReturnValue({
      providers: {
        openrouter: {
          id: 'openrouter',
          name: 'OpenRouter',
          apiKey: '',
          defaultModel: 'openai/gpt-4o',
          enabled: true,
        },
      },
    });

    expect(getProviderClient('openrouter')).toBeNull();
  });
});
