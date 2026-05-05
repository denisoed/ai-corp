import { describe, it, expect } from 'vitest';
import { formatLlmUsage } from '../../../src/server/lib/llm-usage';

describe('formatLlmUsage', () => {
  it('returns null for undefined usage', () => {
    expect(formatLlmUsage(undefined)).toBeNull();
  });

  it('returns null for empty usage object', () => {
    expect(formatLlmUsage({})).toBeNull();
  });

  it('formats tokens correctly', () => {
    const result = formatLlmUsage({
      inputTokens: 1000,
      outputTokens: 200,
      totalTokens: 1200,
    });
    expect(result).toBe('LLM usage: input=1000, output=200, total=1200');
  });

  it('formats with cost', () => {
    const result = formatLlmUsage({
      inputTokens: 500,
      outputTokens: 150,
      totalTokens: 650,
      cost: 0.0075,
    });
    expect(result).toContain('cost=0.007500');
  });

  it('includes cached tokens when present', () => {
    const result = formatLlmUsage({
      inputTokens: 800,
      outputTokens: 100,
      totalTokens: 900,
      cachedTokens: 300,
    });
    expect(result).toContain('cached=300');
  });

  it('does not include cached tokens when zero', () => {
    const result = formatLlmUsage({
      inputTokens: 800,
      outputTokens: 100,
      totalTokens: 900,
      cachedTokens: 0,
    });
    expect(result).not.toContain('cached');
  });

  it('includes reasoning tokens when present', () => {
    const result = formatLlmUsage({
      inputTokens: 1000,
      outputTokens: 500,
      totalTokens: 1500,
      reasoningTokens: 2000,
    });
    expect(result).toContain('reasoning=2000');
  });

  it('handles all fields', () => {
    const result = formatLlmUsage({
      inputTokens: 3000,
      outputTokens: 800,
      totalTokens: 3800,
      cachedTokens: 1200,
      reasoningTokens: 500,
      cost: 0.045,
    });
    expect(result).toContain('input=3000');
    expect(result).toContain('output=800');
    expect(result).toContain('total=3800');
    expect(result).toContain('cached=1200');
    expect(result).toContain('reasoning=500');
    expect(result).toContain('cost=0.045000');
  });
});
