# LLM Cost Optimization Plan

## Goal
Reduce token usage and cost per LLM call without breaking tool-calling, agent behavior, or Telegram/cron workflows.

## Current Observations
- `companyTools` is sent on every `chat()` request.
- The system prompt includes role, identity, soul, memory context, and pending messages.
- Telegram requests add formatting rules on top of the base prompt.
- Cron requests add Telegram capability instructions when a bot is configured.
- Tool-calling flows produce two LLM calls by design:
  - first call decides whether to use tools
  - second call uses tool results to produce the final response

## Optimization Plan

### 1. Split LLM calls into `tool-enabled` and `text-only`
- Send `companyTools` only when the scenario actually needs tools.
- Keep tools enabled for:
  - Telegram agent chat
  - `ask_agent`
  - cron execution
- Disable tools for:
  - memory summarization
  - simple text-only interactions
  - tests and utility calls that do not need tool access

### 2. Add a text-only chat session path
- Introduce a lighter `ChatSession` path without tools.
- Use it whenever the model only needs to generate text.
- This removes the largest fixed payload from non-tool flows.

### 3. Reduce the base system prompt
- Split the agent prompt into:
  - core prompt: role, identity, soul
  - dynamic context: memory and pending messages
- Keep the core prompt always.
- Add dynamic context only when it actually helps the current request.

### 4. Limit memory context size
- Cap summary length.
- Limit key facts to a fixed number of items.
- Keep recent context short.
- Avoid carrying too many old messages into `memory.md`.

### 5. Keep tool outputs compact
- Tool results should be short and structured.
- Avoid returning large blobs unless the user explicitly needs them.
- Large tool outputs increase the size of the second LLM call.

### 6. Keep Telegram formatting rules isolated
- Only attach Telegram formatting instructions to Telegram-facing prompts.
- Do not let them leak into non-Telegram scenarios.

### 7. Split tools by domain
- Group tools by purpose:
  - agent
  - task
  - messaging
  - file
  - role
  - cron
- Pass only the relevant tool subset for a given scenario.
- This is likely the second biggest token saving after disabling tools where unnecessary.

### 8. Measure usage by scenario
- Track usage separately for:
  - Telegram
  - `ask_agent`
  - cron
  - memory summarization
  - text-only calls
- Without this, optimization is guesswork.

## Priority Order
1. Stop sending tools in text-only flows.
2. Reduce the base system prompt and memory payload.
3. Pass only relevant tool subsets.
4. Add per-scenario usage reporting.

## Expected Impact
- Lower fixed token overhead per call.
- Lower cost for non-tool LLM requests.
- Better visibility into where tokens are actually spent.
- No loss of function-calling behavior in workflows that need it.
