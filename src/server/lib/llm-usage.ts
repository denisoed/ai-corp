import type { LLMUsage } from '../llm/types';

export function formatLlmUsage(usage?: LLMUsage): string | null {
  if (!usage) return null;

  const parts: string[] = [];

  if (typeof usage.inputTokens === 'number') parts.push(`input=${usage.inputTokens}`);
  if (typeof usage.outputTokens === 'number') parts.push(`output=${usage.outputTokens}`);
  if (typeof usage.totalTokens === 'number') parts.push(`total=${usage.totalTokens}`);
  if (typeof usage.cachedTokens === 'number' && usage.cachedTokens > 0) parts.push(`cached=${usage.cachedTokens}`);
  if (typeof usage.reasoningTokens === 'number' && usage.reasoningTokens > 0) parts.push(`reasoning=${usage.reasoningTokens}`);
  if (typeof usage.cost === 'number') parts.push(`cost=${usage.cost.toFixed(6)}`);

  return parts.length > 0 ? `LLM usage: ${parts.join(', ')}` : null;
}
