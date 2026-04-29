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
        console.warn(`[Search] DDG returned ${res.status} ${res.statusText}`);
        return [];
      }

      const html = await res.text();

      if (html.includes('anomaly-modal') || html.includes('challenge-form')) {
        console.warn('[Search] DuckDuckGo returned a CAPTCHA. Consider setting up BRAVE_SEARCH_API_KEY for reliable search.');
        return [];
      }

      return this.parseResults(html, limit);
    } catch (e: any) {
      if (e.name === 'AbortError' || e.name === 'TimeoutError') {
        console.warn('[Search] DDG request timed out');
      } else {
        console.warn(`[Search] DDG request failed: ${e.message}`);
      }
      return [];
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

function getSearchBackend(): SearchBackend {
  const backend = process.env.SEARCH_BACKEND || '';
  const braveKey = process.env.BRAVE_SEARCH_API_KEY;
  const searxngUrl = process.env.SEARXNG_URL;

  if (backend === 'mock') {
    console.log('[Search] Using Mock backend (for testing)');
    return new MockBackend();
  }

  if (backend === 'brave' || braveKey) {
    if (!braveKey) {
      console.warn('[Search] Brave selected but BRAVE_SEARCH_API_KEY not set. See .env.example for instructions.');
    } else {
      console.log('[Search] Using Brave Search backend');
      return new BraveBackend(braveKey);
    }
  }

  if (backend === 'searxng' && searxngUrl) {
    console.log(`[Search] Using SearXNG backend (${searxngUrl})`);
    return new SearXngBackend(searxngUrl);
  }

  if (searxngUrl) {
    console.log(`[Search] Using SearXNG backend (auto-detected from SEARXNG_URL)`);
    return new SearXngBackend(searxngUrl);
  }

  if (backend === 'searxng') {
    console.warn('[Search] SearXNG selected but SEARXNG_URL not set. Falling back to DuckDuckGo.');
  }

  console.log('[Search] Using DuckDuckGo backend (may fail with CAPTCHA — set BRAVE_SEARCH_API_KEY for reliability)');
  return new DuckDuckGoBackend();
}

export async function performSearch(query: string, limit: number = 5): Promise<SearchResult[]> {
  const backend = getSearchBackend();
  return backend.search(query, limit);
}

export { getSearchBackend };
export type { SearchResult, SearchBackend };
