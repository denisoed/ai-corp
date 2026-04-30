import type { LLMProviderClient, LLMResponse } from '../types';

export class GoogleClient implements LLMProviderClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl: string) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  async chat(
    model: string,
    messages: { role: string; content: string }[],
    _tools?: unknown,
    _toolChoice?: unknown
  ): Promise<LLMResponse> {
    const systemMessage = messages.find(m => m.role === 'system');
    const userMessages = messages.filter(m => m.role !== 'system');

    const contents = userMessages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    if (systemMessage) {
      contents.unshift({
        role: 'system',
        parts: [{ text: systemMessage.content }],
      });
    }

    const res = await fetch(
      `${this.baseUrl}/models/${model}:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents,
          generationConfig: {
            temperature: 0.7,
            topP: 0.95,
            topK: 40,
          },
        }),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Google API Error ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    return { content };
  }

  async listModels(): Promise<string[]> {
    try {
      const res = await fetch(
        `${this.baseUrl}/models?key=${this.apiKey}`
      );

      if (!res.ok) {
        console.warn('[GoogleClient] Failed to list models:', res.status);
        return [];
      }

      const data = await res.json();
      return data.models?.map((m: { name: string }) => m.name.replace('models/', '')) || [];
    } catch (e) {
      console.warn('[GoogleClient] Failed to list models:', e);
      return [];
    }
  }

  async test(): Promise<boolean> {
    try {
      const res = await fetch(
        `${this.baseUrl}/models?key=${this.apiKey}`
      );
      return res.ok;
    } catch {
      return false;
    }
  }
}
