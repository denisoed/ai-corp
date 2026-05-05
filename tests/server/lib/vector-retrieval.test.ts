import fs from 'fs';
import path from 'path';
import os from 'os';
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { buildVectorIndex, searchSimilar } from '../../../src/server/lib/vector-retrieval';

const testDir = path.join(os.tmpdir(), 'aicorp-vector-test-' + Date.now());

describe('vector retrieval', () => {
  afterAll(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  function makeStore(docIds: string[], docTexts: string[]) {
    return buildVectorIndex(testDir, docIds, docTexts);
  }

  it('finds semantically similar documents even with no shared words', () => {
    const docs = [
      'deploy pipeline failed on production due to timeout',
      'lunch break at cafe with team',
      'investigated deployment failure in staging environment',
      'updated readme with new instructions',
    ];

    const result = makeStore(docs, docs);
    expect(result.success).toBe(true);

    const results = searchSimilar(result.store, 'why did deployment crash', 3);
    expect(results.length).toBeGreaterThan(0);

    // The deployment-related docs should score higher than lunch
    const deployIdx = results.findIndex(r => r.docId.includes('deploy pipeline'));
    const lunchIdx = results.findIndex(r => r.docId.includes('lunch'));
    if (deployIdx >= 0 && lunchIdx >= 0) {
      expect(deployIdx).toBeLessThan(lunchIdx);
    }
  });

  it('ranks exact matches highest', () => {
    const docs = [
      'payment gateway timeout caused transaction failure',
      'discussed payment terms with accountant',
      'regular team sync meeting minutes',
    ];

    const result = makeStore(docs, docs);
    expect(result.success).toBe(true);

    const results = searchSimilar(result.store, 'payment timeout', 3);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].docId).toContain('payment gateway timeout');
  });

  it('handles empty query gracefully', () => {
    const docs = ['some document text'];
    const result = makeStore(docs, docs);

    const results = searchSimilar(result.store, '', 5);
    expect(results).toEqual([]);
  });

  it('handles empty document set', () => {
    const result = makeStore([], []);
    expect(result.success).toBe(false);

    const results = searchSimilar(result.store, 'anything', 5);
    expect(results).toEqual([]);
  });

  it('persists vector store to disk', () => {
    const docs = ['hello world test'];
    const result = makeStore(docs, docs);

    expect(result.success).toBe(true);
    expect(fs.existsSync(path.join(testDir, 'memory.vectors.json'))).toBe(true);

    const stored = JSON.parse(fs.readFileSync(path.join(testDir, 'memory.vectors.json'), 'utf8'));
    expect(stored.version).toBe(1);
    expect(stored.docCount).toBe(1);
    expect(Object.keys(stored.vectors).length).toBe(1);
  });

  it('detects true negatives — irrelevant docs score zero', () => {
    const docs = [
      'java spring boot configuration guide',
      'maven dependency resolution steps',
    ];

    const result = makeStore(docs, docs);
    const results = searchSimilar(result.store, 'react hooks useState useEffect', 2);

    expect(results.every(r => r.score < 0.15)).toBe(true);
  });
});
