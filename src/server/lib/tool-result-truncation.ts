interface TruncationLimit {
  maxLines?: number;
  maxEntries?: number;
  maxChars?: number;
  mostRecent?: boolean;
}

const LIMITS: Record<string, TruncationLimit> = {
  read_file: { maxLines: 500 },
  list_files: { maxEntries: 50 },
  web_search: { maxEntries: 3 },
  fetch_url: { maxChars: 10000 },
  http_request: { maxChars: 10000 },
  get_task_details: { maxEntries: 10, mostRecent: true },
  search_tasks: { maxEntries: 30 },
  get_company_state: { maxEntries: 50 },
  get_agent_details: { maxEntries: 20 },
  check_my_inbox: { maxEntries: 10 },
  generate_report: { maxChars: 5000 },
  list_roles: { maxEntries: 20 },
  list_crons: { maxEntries: 20 },
  list_pipelines: { maxEntries: 20 },
  list_subscriptions: { maxEntries: 20 },
};

const GENERIC_MAX_ARRAY_LENGTH = 100;
const GENERIC_MAX_STRING_LENGTH = 15000;

function findArrayToTruncate(obj: Record<string, unknown>, limit: TruncationLimit): { key: string; arr: unknown[] } | null {
  if (Array.isArray(obj) && obj.length > 0) {
    return { key: 'items', arr: obj };
  }

  const candidateKeys = ['files', 'results', 'tasks', 'agents', 'comments', 'subtasks',
    'incoming', 'recentOutgoing', 'roles', 'crons', 'pipelines', 'subscriptions'];

  for (const key of candidateKeys) {
    const val = obj[key];
    if (Array.isArray(val) && val.length > 0) {
      return { key, arr: val };
    }
  }

  return null;
}

function truncateString(value: string, maxChars: number, label?: string): string {
  if (value.length <= maxChars) return value;
  const truncated = value.slice(0, maxChars);
  return label
    ? `${truncated}\n\n... [truncated: showing first ${maxChars} of ${value.length} chars]`
    : `${truncated}\n... [truncated]`;
}

function truncateArray(arr: unknown[], maxEntries: number, mostRecent: boolean): unknown[] {
  if (arr.length <= maxEntries) return arr;
  return mostRecent ? arr.slice(-maxEntries) : arr.slice(0, maxEntries);
}

export function truncateToolResult(toolName: string, result: unknown): unknown {
  if (!result || typeof result !== 'object') return result;

  const obj = result as Record<string, unknown>;
  const limit = LIMITS[toolName];

  if (limit) {
    const truncated = { ...obj } as Record<string, unknown>;

    if (toolName === 'read_file' && typeof truncated.content === 'string') {
      const lines = truncated.content.split('\n');
      if (lines.length > (limit.maxLines || 500)) {
        truncated.content = lines.slice(0, limit.maxLines!).join('\n') +
          `\n\n... [truncated: showing first ${limit.maxLines} of ${lines.length} lines]`;
        truncated.truncated = true;
      }
      return truncated;
    }

    if (toolName === 'generate_report' && typeof truncated.report === 'string') {
      truncated.report = truncateString(truncated.report, limit.maxChars || 5000,
        `${limit.maxChars} of ${truncated.report.length} chars`);
      if (truncated.report !== obj.report) truncated.truncated = true;
      return truncated;
    }

    if ((toolName === 'fetch_url' || toolName === 'http_request') && typeof truncated.content === 'string') {
      truncated.content = truncateString(truncated.content, limit.maxChars || 10000,
        `${limit.maxChars} of ${(truncated.content as string).length} chars`);
      if (truncated.content !== obj.content) truncated.truncated = true;
      return truncated;
    }

    if (toolName === 'http_request' && typeof truncated.body === 'string') {
      truncated.body = truncateString(truncated.body, limit.maxChars || 10000,
        `${limit.maxChars} of ${(truncated.body as string).length} chars`);
      if (truncated.body !== obj.body) truncated.truncated = true;
      return truncated;
    }

    if (toolName === 'get_task_details') {
      if (Array.isArray(truncated.comments) && truncated.comments.length > (limit.maxEntries || 10)) {
        const original = truncated.comments.length;
        truncated.comments = truncateArray(truncated.comments as unknown[], limit.maxEntries!, true);
        truncated.truncated = true;
        truncated.truncatedCount = original - (limit.maxEntries || 10);
      }
      if (Array.isArray(truncated.subtasks) && truncated.subtasks.length > 20) {
        truncated.subtasks = truncateArray(truncated.subtasks as unknown[], 20, false);
        truncated.truncated = true;
      }
      return truncated;
    }

    if (toolName === 'get_agent_details' && truncated.agent && typeof truncated.agent === 'object') {
      const agent = truncated.agent as Record<string, unknown>;
      if (agent.tasks && Array.isArray(agent.tasks) && agent.tasks.length > (limit.maxEntries || 20)) {
        agent.tasks = truncateArray(agent.tasks as unknown[], limit.maxEntries!, false);
        truncated.truncated = true;
      }
      return truncated;
    }

    const arrayResult = findArrayToTruncate(truncated, limit);
    if (arrayResult) {
      const arr = arrayResult.arr;
      truncated[arrayResult.key] = truncateArray(arr, limit.maxEntries!, limit.mostRecent || false);
      truncated.truncated = true;
      truncated.truncatedCount = arr.length - (limit.maxEntries || 50);
      return truncated;
    }
  }

  return applyGenericSafetyNet(result);
}

function applyGenericSafetyNet(result: unknown): unknown {
  if (!result || typeof result !== 'object') return result;

  const obj = { ...(result as Record<string, unknown>) } as Record<string, unknown>;
  let changed = false;

  for (const [key, value] of Object.entries(obj)) {
    if (Array.isArray(value) && value.length > GENERIC_MAX_ARRAY_LENGTH) {
      obj[key] = value.slice(0, GENERIC_MAX_ARRAY_LENGTH);
      (obj as any).truncated = true;
      (obj as any).truncatedKey = key;
      (obj as any).truncatedCount = value.length - GENERIC_MAX_ARRAY_LENGTH;
      changed = true;
    }
    if (typeof value === 'string' && value.length > GENERIC_MAX_STRING_LENGTH) {
      obj[key] = truncateString(value, GENERIC_MAX_STRING_LENGTH);
      (obj as any).truncated = true;
      changed = true;
    }
  }

  return changed ? obj : result;
}
