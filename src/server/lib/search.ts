import { getSettings } from './settings';

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

interface SearchBackend {
  search(query: string, limit: number): Promise<SearchResult[]>;
}

const MOCK_RESULTS: SearchResult[] = [
  {
    title: 'React 19 Released — React Blog',
    url: 'https://react.dev/blog/2024/12/05/react-19',
    snippet: 'React 19 introduces new features including Actions, a new use() API, useOptimistic, the <form> actions integration, and improved server components support.',
  },
  {
    title: 'What\'s New in React 19: A Comprehensive Guide',
    url: 'https://www.freecodecamp.org/news/react-19-new-features/',
    snippet: 'React 19 is now stable. Key features: React Compiler (auto-memoization), Server Components, Actions for form handling, use() hook, document metadata, and stylesheet support.',
  },
  {
    title: 'React 19 Release Notes — GitHub',
    url: 'https://github.com/facebook/react/releases/tag/v19.0.0',
    snippet: 'React 19.0.0 is the first major release since 2022. It includes support for async transitions with useTransition, the useActionState hook, and improvements to suspense.',
  },
];

class DuckDuckGoBackend implements SearchBackend {
  async search(query: string, limit: number): Promise<SearchResult[]> {
    const url = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;

    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; AiCorpBot/1.0)',
          'Accept': 'text/html',
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        throw new Error(`DuckDuckGo returned ${res.status} ${res.statusText}`);
      }

      const html = await res.text();

      if (html.includes('anomaly-modal') || html.includes('challenge-form')) {
        throw new Error('DuckDuckGo returned a CAPTCHA');
      }

      const results = this.parseResults(html, limit);
      if (results.length === 0) {
        throw new Error('DuckDuckGo returned no parseable results');
      }

      return results;
    } catch (e: any) {
      if (e.name === 'AbortError' || e.name === 'TimeoutError') {
        throw new Error('DuckDuckGo request timed out');
      } else {
        throw e;
      }
    }
  }

  private parseResults(html: string, limit: number): SearchResult[] {
    const results: SearchResult[] = [];
    const linkRegex = /<a[^>]*class="result-link"[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/g;
    const snippetRegex = /<td[^>]*class="result-snippet"[^>]*>(.*?)<\/td>/g;

    const links: Array<{ url: string; title: string }> = [];
    const snippets: string[] = [];

    let m: RegExpExecArray | null;
    while ((m = linkRegex.exec(html)) !== null) {
      links.push({ url: m[1], title: this.stripHtml(m[2]) });
    }
    while ((m = snippetRegex.exec(html)) !== null) {
      snippets.push(this.stripHtml(m[1]));
    }

    for (let i = 0; i < Math.min(links.length, snippets.length, limit); i++) {
      results.push({
        title: links[i].title,
        url: links[i].url,
        snippet: snippets[i],
      });
    }

    if (results.length === 0) {
      const legacyLinks: Array<{ url: string; title: string }> = [];
      const linkRegex2 = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/g;
      const snippetRegex2 = /<a[^>]*class="result__snippet"[^>]*>(.*?)<\/a>/g;
      while ((m = linkRegex2.exec(html)) !== null) {
        let rawUrl = m[1];
        const title = this.stripHtml(m[2]);
        if (rawUrl.startsWith('//duckduckgo.com/l/')) {
          const uddgMatch = rawUrl.match(/uddg=([^&]+)/);
          if (uddgMatch) rawUrl = decodeURIComponent(uddgMatch[1]);
        }
        if (rawUrl && rawUrl.startsWith('http') && title) {
          legacyLinks.push({ url: rawUrl, title });
        }
      }
      const legacySnippets: string[] = [];
      while ((m = snippetRegex2.exec(html)) !== null) {
        legacySnippets.push(this.stripHtml(m[1]));
      }
      for (let i = 0; i < Math.min(legacyLinks.length, legacySnippets.length, limit); i++) {
        results.push({
          title: legacyLinks[i].title,
          url: legacyLinks[i].url,
          snippet: legacySnippets[i],
        });
      }
    }

    return results;
  }

  private stripHtml(text: string): string {
    return text
      .replace(/<[^>]*>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}

class BraveBackend implements SearchBackend {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async search(query: string, limit: number): Promise<SearchResult[]> {
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${Math.min(limit, 20)}`;

    const res = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': this.apiKey,
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.warn(`[Search] Brave returned ${res.status} ${res.statusText}`);
      return [];
    }

    const data = await res.json() as {
      web?: { results?: Array<{ title: string; url: string; description: string }> };
    };

    return (data.web?.results || [])
      .slice(0, limit)
      .map(r => ({
        title: r.title,
        url: r.url,
        snippet: r.description || '',
      }));
  }
}

class SearXngBackend implements SearchBackend {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async search(query: string, limit: number): Promise<SearchResult[]> {
    const url = `${this.baseUrl}/search?q=${encodeURIComponent(query)}&format=json&categories=general`;

    const res = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.warn(`[Search] SearXNG returned ${res.status} ${res.statusText}`);
      return [];
    }

    const data = await res.json() as {
      results?: Array<{ title: string; url: string; content: string }>;
    };

    return (data.results || [])
      .slice(0, limit)
      .map(r => ({
        title: r.title,
        url: r.url,
        snippet: r.content || '',
      }));
  }
}

class MockBackend implements SearchBackend {
  async search(_query: string, limit: number): Promise<SearchResult[]> {
    console.log(`[Search] Using MOCK backend (query: "${_query.slice(0, 50)}")`);
    return MOCK_RESULTS.slice(0, limit);
  }
}

class FallbackBackend implements SearchBackend {
  private primary: SearchBackend;
  private fallback: SearchBackend;
  private primaryName: string;

  constructor(primary: SearchBackend, fallback: SearchBackend, primaryName: string) {
    this.primary = primary;
    this.fallback = fallback;
    this.primaryName = primaryName;
  }

  async search(query: string, limit: number): Promise<SearchResult[]> {
    try {
      const results = await this.primary.search(query, limit);
      if (results.length > 0) return results;
      throw new Error('No results');
    } catch (e: any) {
      console.warn(`[Search] ${this.primaryName} failed (${e.message || 'no results'}), falling back to DuckDuckGo`);
      try {
        const fallbackResults = await this.fallback.search(query, limit);
        if (fallbackResults.length > 0) return fallbackResults;
        throw new Error('DuckDuckGo returned no results');
      } catch (fallbackError: any) {
        throw new Error(
          `${this.primaryName} failed (${e.message || 'no results'}); DuckDuckGo fallback failed (${fallbackError.message || 'no results'})`
        );
      }
    }
  }
}

class ChainedFallbackBackend implements SearchBackend {
  private primary: SearchBackend;
  private secondary: SearchBackend;
  private tertiary: SearchBackend;
  private primaryName: string;
  private secondaryName: string;

  constructor(
    primary: SearchBackend,
    secondary: SearchBackend,
    tertiary: SearchBackend,
    primaryName: string,
    secondaryName: string,
  ) {
    this.primary = primary;
    this.secondary = secondary;
    this.tertiary = tertiary;
    this.primaryName = primaryName;
    this.secondaryName = secondaryName;
  }

  async search(query: string, limit: number): Promise<SearchResult[]> {
    try {
      const results = await this.primary.search(query, limit);
      if (results.length > 0) return results;
      throw new Error('No results');
    } catch (primaryError: any) {
      console.warn(`[Search] ${this.primaryName} failed (${primaryError.message || 'no results'}), falling back to ${this.secondaryName}`);
      try {
        const secondaryResults = await this.secondary.search(query, limit);
        if (secondaryResults.length > 0) return secondaryResults;
        throw new Error('No results');
      } catch (secondaryError: any) {
        console.warn(`[Search] ${this.secondaryName} failed (${secondaryError.message || 'no results'}), falling back to DuckDuckGo`);
        try {
          const tertiaryResults = await this.tertiary.search(query, limit);
          if (tertiaryResults.length > 0) return tertiaryResults;
          throw new Error('DuckDuckGo returned no results');
        } catch (tertiaryError: any) {
          throw new Error(
            `${this.primaryName} failed (${primaryError.message || 'no results'}); ` +
            `${this.secondaryName} failed (${secondaryError.message || 'no results'}); ` +
            `DuckDuckGo fallback failed (${tertiaryError.message || 'no results'})`
          );
        }
      }
    }
  }
}

function getSearchBackend(): SearchBackend {
  const appSettings = getSettings();
  const braveKey = appSettings.braveApiKey || process.env.BRAVE_SEARCH_API_KEY;
  const searxngUrl = appSettings.searxngUrl || process.env.SEARXNG_URL;
  const ddgBackend = new DuckDuckGoBackend();
  const braveBackend = braveKey ? new BraveBackend(braveKey) : null;
  const searxngBackend = searxngUrl ? new SearXngBackend(searxngUrl) : null;

  if (braveBackend && searxngBackend) {
    console.log(`[Search] Using Brave Search backend, then SearXNG, then DuckDuckGo`);
    return new ChainedFallbackBackend(braveBackend, searxngBackend, ddgBackend, 'Brave', 'SearXNG');
  }

  if (braveBackend) {
    console.log('[Search] Using Brave Search backend, then DuckDuckGo');
    return new FallbackBackend(braveBackend, ddgBackend, 'Brave');
  }

  if (searxngBackend) {
    console.log(`[Search] Using SearXNG backend, then DuckDuckGo: ${searxngUrl}`);
    return new FallbackBackend(searxngBackend, ddgBackend, 'SearXNG');
  }

  console.log('[Search] Using DuckDuckGo backend');
  return ddgBackend;
}

export async function performSearch(query: string, limit: number = 5): Promise<SearchResult[]> {
  const backend = getSearchBackend();
  return backend.search(query, limit);
}

export { getSearchBackend };
export type { SearchResult, SearchBackend };
