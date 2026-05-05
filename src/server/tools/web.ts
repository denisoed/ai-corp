import { hasPermission, getStore } from '../store';
import { performSearch } from '../lib/search';
import { logAction } from './agent';

const FETCH_TIMEOUT_MS = 10000;
const FETCH_MAX_SIZE = 500 * 1024;
const MAX_RESULTS = 10;

const BLOCKED_HOSTS = new Set([
  'localhost', '127.0.0.1', '0.0.0.0',
  '::1', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16',
  '169.254.0.0/16', '100.64.0.0/10',
]);

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
  for (const blocked of BLOCKED_HOSTS) {
    if (hostname === blocked || hostname.endsWith(`.${blocked}`)) {
      return true;
    }
  }

  if (hostname === 'localhost' || hostname.endsWith('.localhost')) return true;

  return false;
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
