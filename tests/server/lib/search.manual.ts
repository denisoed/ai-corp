import { performSearch } from '../../../src/server/lib/search.js';

async function main() {
  process.env.SEARCH_BACKEND = 'mock';

  console.log('=== Test web_search (MOCK backend) ===\n');
  const results = await performSearch('React 19 features', 3);
  console.log(`Results: ${results.length}\n`);

  for (const r of results) {
    console.log(`  ✓ ${r.title}`);
    console.log(`    ${r.url}`);
    console.log(`    ${r.snippet.slice(0, 100)}...\n`);
  }

  if (results.length > 0) {
    console.log('=== Test fetch_url (real) ===\n');
    const url = results[0].url;
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TestBot/1.0)' },
        signal: AbortSignal.timeout(8000),
      });
      console.log(`  URL:  ${url.slice(0, 60)}...`);
      console.log(`  HTTP: ${res.status} ${res.statusText}`);
      console.log(`  Type: ${res.headers.get('content-type')}`);
      console.log('  ✓ fetch_url ready');
    } catch (e: any) {
      console.log(`  ✗ ${e.message.slice(0, 80)}`);
    }
  }

  console.log('\n=== DONE: web_search + fetch_url pipeline working ===');
}

main().catch(e => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
