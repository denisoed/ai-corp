import { hasPermission, getStore } from '../store';
import { performSearch } from '../lib/search';
import { logAction } from './agent';

const FETCH_TIMEOUT_MS = 10000;
const FETCH_MAX_SIZE = 500 * 1024;
const MAX_RESULTS = 10;

const BLOCKED_HOST_SUFFIXES = [
  '.localhost', '.internal', '.local', '.home',
];

const PRIVATE_IPV4_RANGES = [
  { prefix: '127.', mask: 8 },   // loopback
  { prefix: '10.', mask: 8 },    // private A
  { prefix: '172.16.', mask: 12 }, // private B
  { prefix: '172.17.', mask: 12 },
  { prefix: '172.18.', mask: 12 },
  { prefix: '172.19.', mask: 12 },
  { prefix: '172.20.', mask: 12 },
  { prefix: '172.21.', mask: 12 },
  { prefix: '172.22.', mask: 12 },
  { prefix: '172.23.', mask: 12 },
  { prefix: '172.24.', mask: 12 },
  { prefix: '172.25.', mask: 12 },
  { prefix: '172.26.', mask: 12 },
  { prefix: '172.27.', mask: 12 },
  { prefix: '172.28.', mask: 12 },
  { prefix: '172.29.', mask: 12 },
  { prefix: '172.30.', mask: 12 },
  { prefix: '172.31.', mask: 12 },
  { prefix: '192.168.', mask: 16 }, // private C
  { prefix: '169.254.', mask: 16 }, // link-local
  { prefix: '100.64.', mask: 10 },  // CGNAT: 100.64.0.0 – 100.127.255.255
  { prefix: '100.65.', mask: 10 },
  { prefix: '100.66.', mask: 10 },
  { prefix: '100.67.', mask: 10 },
  { prefix: '100.68.', mask: 10 },
  { prefix: '100.69.', mask: 10 },
  { prefix: '100.70.', mask: 10 },
  { prefix: '100.71.', mask: 10 },
  { prefix: '100.72.', mask: 10 },
  { prefix: '100.73.', mask: 10 },
  { prefix: '100.74.', mask: 10 },
  { prefix: '100.75.', mask: 10 },
  { prefix: '100.76.', mask: 10 },
  { prefix: '100.77.', mask: 10 },
  { prefix: '100.78.', mask: 10 },
  { prefix: '100.79.', mask: 10 },
  { prefix: '100.80.', mask: 10 },
  { prefix: '100.81.', mask: 10 },
  { prefix: '100.82.', mask: 10 },
  { prefix: '100.83.', mask: 10 },
  { prefix: '100.84.', mask: 10 },
  { prefix: '100.85.', mask: 10 },
  { prefix: '100.86.', mask: 10 },
  { prefix: '100.87.', mask: 10 },
  { prefix: '100.88.', mask: 10 },
  { prefix: '100.89.', mask: 10 },
  { prefix: '100.90.', mask: 10 },
  { prefix: '100.91.', mask: 10 },
  { prefix: '100.92.', mask: 10 },
  { prefix: '100.93.', mask: 10 },
  { prefix: '100.94.', mask: 10 },
  { prefix: '100.95.', mask: 10 },
  { prefix: '100.96.', mask: 10 },
  { prefix: '100.97.', mask: 10 },
  { prefix: '100.98.', mask: 10 },
  { prefix: '100.99.', mask: 10 },
  { prefix: '100.100.', mask: 10 },
  { prefix: '100.101.', mask: 10 },
  { prefix: '100.102.', mask: 10 },
  { prefix: '100.103.', mask: 10 },
  { prefix: '100.104.', mask: 10 },
  { prefix: '100.105.', mask: 10 },
  { prefix: '100.106.', mask: 10 },
  { prefix: '100.107.', mask: 10 },
  { prefix: '100.108.', mask: 10 },
  { prefix: '100.109.', mask: 10 },
  { prefix: '100.110.', mask: 10 },
  { prefix: '100.111.', mask: 10 },
  { prefix: '100.112.', mask: 10 },
  { prefix: '100.113.', mask: 10 },
  { prefix: '100.114.', mask: 10 },
  { prefix: '100.115.', mask: 10 },
  { prefix: '100.116.', mask: 10 },
  { prefix: '100.117.', mask: 10 },
  { prefix: '100.118.', mask: 10 },
  { prefix: '100.119.', mask: 10 },
  { prefix: '100.120.', mask: 10 },
  { prefix: '100.121.', mask: 10 },
  { prefix: '100.122.', mask: 10 },
  { prefix: '100.123.', mask: 10 },
  { prefix: '100.124.', mask: 10 },
  { prefix: '100.125.', mask: 10 },
  { prefix: '100.126.', mask: 10 },
  { prefix: '100.127.', mask: 10 },
  { prefix: '0.', mask: 24 },     // 0.0.0.0
  { prefix: '::1', mask: 128 },   // IPv6 loopback
];

export async function handleWebSearch(args: any, executingAgentId: string): Promise<any> {
  const query = String(args.query || '').trim();
  if (!query) {
    return { success: false, error: 'Query is required for web_search.' };
  }

  if (!hasPermission(executingAgentId, 'system:web_search' as any)) {
    return { success: false, error: 'You do not have system:web_search permission.' };
  }

  const limit = Math.min(args.num_results && Number.isFinite(args.num_results) ? args.num_results : 5, MAX_RESULTS);

  try {
    const results = await performSearch(query, limit);

    if (results.length === 0) {
      return {
        success: false,
        error: 'Search returned no results. Configure BRAVE_SEARCH_API_KEY or SEARXNG_URL for more reliable search.',
      };
    }

    logAction(
      'Web Search',
      `Searched "${query.slice(0, 80)}" — ${results.length} results.`,
      'success',
      executingAgentId,
      'tool',
      'web',
      undefined,
      { query, resultCount: results.length }
    );

    return {
      success: true,
      query,
      totalResults: results.length,
      results,
    };
  } catch (e: any) {
    console.error('[WebSearch] Search failed:', e);
    return { success: false, error: `Search failed: ${e.message || 'Unknown error'}` };
  }
}

export async function handleFetchUrl(args: any, executingAgentId: string): Promise<any> {
  const rawUrl = String(args.url || '').trim();
  if (!rawUrl) {
    return { success: false, error: 'URL is required for fetch_url.' };
  }

  if (!hasPermission(executingAgentId, 'system:fetch_url' as any)) {
    return { success: false, error: 'You do not have system:fetch_url permission.' };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { success: false, error: `Invalid URL: "${rawUrl}"` };
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { success: false, error: `Only HTTP and HTTPS URLs are supported. Got: ${parsed.protocol}` };
  }

  if (isPrivateHost(parsed.hostname)) {
    return { success: false, error: `Fetching private/internal hosts is not allowed: ${parsed.hostname}` };
  }

  try {
    const res = await fetch(rawUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AiCorpBot/1.0)',
        'Accept': 'text/html, text/plain, application/json',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'follow',
    });

    if (!res.ok) {
      return { success: false, error: `HTTP ${res.status} ${res.statusText} for "${rawUrl}"` };
    }

    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('text/html') || contentType.includes('text/plain') || contentType.includes('application/json')) {
      let text = await res.text();
      const originalSize = text.length;

      if (text.length > FETCH_MAX_SIZE) {
        text = text.slice(0, FETCH_MAX_SIZE) + '\n\n[...truncated]';
      }

      if (contentType.includes('text/html')) {
        text = stripHtml(text);
      }

      logAction(
        'URL Fetched',
        `Fetched "${rawUrl.slice(0, 80)}" — ${originalSize} bytes → ${text.length} chars.`,
        'success',
        executingAgentId,
        'tool',
        'web',
        undefined,
        { url: rawUrl, fetchedSize: originalSize }
      );

      return {
        success: true,
        url: rawUrl,
        contentType,
        size: originalSize,
        content: text,
      };
    }

    return {
      success: false,
      error: `Unsupported content type: "${contentType}". Supported: text/html, text/plain, application/json.`,
    };
  } catch (e: any) {
    if (e.name === 'AbortError' || e.name === 'TimeoutError') {
      return { success: false, error: `Request timed out for "${rawUrl}" (${FETCH_TIMEOUT_MS / 1000}s).` };
    }
    console.error('[FetchUrl] Fetch failed:', e);
    return { success: false, error: `Fetch failed: ${e.message || 'Unknown error'}` };
  }
}

function isPrivateHost(hostname: string): boolean {
  if (hostname === 'localhost') return true;

  for (const suffix of BLOCKED_HOST_SUFFIXES) {
    if (hostname === suffix.slice(1) || hostname.endsWith(suffix)) return true;
  }

  for (const range of PRIVATE_IPV4_RANGES) {
    if (hostname.startsWith(range.prefix)) return true;
  }

  // Check IPv6 loopback variants
  if (hostname === '::1' || hostname === '0:0:0:0:0:0:0:1' || hostname.startsWith('fe80:')) return true;

  return false;
}

function resolveEnvVars(value: string, envVars: Record<string, string>): string {
  return value.replace(/\$\{?(\w+)\}?/g, (_, name) => envVars[name] || `\$${name}`);
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&hellip;/g, '…')
    .replace(/&\w+;/g, '')
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

const HTTP_REQUEST_TIMEOUT = 30000;
const HTTP_REQUEST_MAX_TIMEOUT = 60000;
const HTTP_REQUEST_MAX_SIZE = 500 * 1024;

export async function handleHttpRequest(args: any, executingAgentId: string): Promise<any> {
  const method = String(args.method || 'GET').toUpperCase().trim();
  const rawUrl = String(args.url || '').trim();

  if (!['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
    return { success: false, error: `Unsupported HTTP method: "${method}". Use GET, POST, PUT, DELETE, or PATCH.` };
  }

  if (!rawUrl) {
    return { success: false, error: 'URL is required for http_request.' };
  }

  if (!hasPermission(executingAgentId, 'system:http_request' as any)) {
    return { success: false, error: 'You do not have system:http_request permission.' };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { success: false, error: `Invalid URL: "${rawUrl}"` };
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { success: false, error: `Only HTTP and HTTPS URLs are supported. Got: ${parsed.protocol}` };
  }

  if (isPrivateHost(parsed.hostname)) {
    return { success: false, error: `Requests to private/internal hosts are not allowed: ${parsed.hostname}` };
  }

  // Check workspace-level domain whitelist and collect per-domain headers
  const state = getStore();
  const agent = state.agents.find(a => a.id === executingAgentId);
  const ws = agent?.workspaceId ? state.workspaces.find(w => w.id === agent.workspaceId) : undefined;
  const allowedDomains = ws?.settings?.allowedHttpDomains;
  let domainHeaders: Record<string, string> | undefined;

  if (allowedDomains && allowedDomains.length > 0) {
    const hostname = parsed.hostname.toLowerCase();
    const matched = allowedDomains.find(d => {
      const pattern = d.domain.toLowerCase();
      return hostname === pattern || hostname.endsWith('.' + pattern);
    });
    if (!matched) {
      const domainNames = allowedDomains.map(d => d.domain).join(', ');
      return { success: false, error: `Domain "${parsed.hostname}" is not in the workspace's allowed HTTP domains list. Allowed: ${domainNames}` };
    }
    domainHeaders = matched.headers;
  }

  // Collect env vars for $VAR resolution in header values
  const envVars: Record<string, string> = {
    ...(ws?.settings?.envVars || {}),
  };

  const timeout = Math.min(
    args.timeout && Number.isFinite(args.timeout) ? args.timeout : HTTP_REQUEST_TIMEOUT,
    HTTP_REQUEST_MAX_TIMEOUT
  );

  try {
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (compatible; AiCorpBot/1.0)',
      'Accept': 'application/json, text/plain, text/html, */*',
    };

    if (args.headers && typeof args.headers === 'object') {
      for (const [key, value] of Object.entries(args.headers)) {
        if (typeof value === 'string') {
          headers[key] = value;
        }
      }
    }

    // Merge per-domain headers (from workspace config), resolved against env vars
    if (domainHeaders) {
      for (const [key, value] of Object.entries(domainHeaders)) {
        headers[key] = resolveEnvVars(value, envVars);
      }
    }

    const fetchOptions: RequestInit = {
      method,
      headers,
      signal: AbortSignal.timeout(timeout),
      redirect: 'follow',
    };

    if (method !== 'GET' && method !== 'HEAD' && args.body !== undefined) {
      fetchOptions.body = String(args.body);
    }

    const res = await fetch(rawUrl, fetchOptions);

    const contentType = res.headers.get('content-type') || '';
    const responseHeaders: Record<string, string> = {};
    res.headers.forEach((value, key) => {
      if (['content-type', 'content-length', 'date', 'server', 'x-request-id', 'x-ratelimit-remaining',
           'x-ratelimit-limit', 'x-ratelimit-reset', 'retry-after', 'etag', 'link'].includes(key.toLowerCase())) {
        responseHeaders[key] = value;
      }
    });

    let body: string | undefined;
    try {
      const text = await res.text();
      body = text.length > HTTP_REQUEST_MAX_SIZE
        ? text.slice(0, HTTP_REQUEST_MAX_SIZE) + '\n\n[...truncated]'
        : text;
    } catch {
      body = undefined;
    }

    logAction(
      'HTTP Request',
      `${method} ${rawUrl.slice(0, 80)} → ${res.status} ${res.statusText}${body ? ` (${body.length} bytes)` : ''}`,
      res.ok ? 'success' : 'warning',
      executingAgentId,
      'tool',
      'web',
      undefined,
      { url: rawUrl, method }
    );

    return {
      success: true,
      status: res.status,
      statusText: res.statusText,
      headers: responseHeaders,
      body,
    };
  } catch (e: any) {
    if (e.name === 'AbortError' || e.name === 'TimeoutError') {
      return { success: false, error: `Request timed out for "${rawUrl}" (${timeout / 1000}s).` };
    }
    console.error('[HttpRequest] Failed:', e);
    return { success: false, error: `HTTP request failed: ${e.message || 'Unknown error'}` };
  }
}
