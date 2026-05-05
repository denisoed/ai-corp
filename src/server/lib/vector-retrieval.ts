import fs from 'fs';
import path from 'path';

const MIN_WORD_LEN = 3;
const MAX_TOKENS = 200;
const IDF_MIN_COUNT = 1;

interface SparseVector {
  [term: string]: number;
}

interface VectorStore {
  version: number;
  updatedAt: string;
  docCount: number;
  idf: Record<string, number>;
  vectors: Record<string, SparseVector>;
}

function tokenize(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9а-яё_/-]/gi, ' ')
    .split(/\s+/)
    .filter(w => w.length >= MIN_WORD_LEN)
    .filter(w => !/^\d+$/.test(w));

  const freq: Record<string, number> = {};
  for (const w of words) {
    freq[w] = (freq[w] || 0) + 1;
  }

  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_TOKENS)
    .map(([term]) => term);
}

function cosineSimilarity(a: SparseVector, b: SparseVector): number {
  const allTerms = new Set([...Object.keys(a), ...Object.keys(b)]);
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (const term of allTerms) {
    const va = a[term] || 0;
    const vb = b[term] || 0;
    dotProduct += va * vb;
    normA += va * va;
    normB += vb * vb;
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

function loadVectorStore(filePath: string): VectorStore | null {
  try {
    if (fs.existsSync(filePath)) {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (parsed?.version === 1 && parsed?.vectors && parsed?.idf) {
        return parsed as VectorStore;
      }
    }
  } catch {}
  return null;
}

function saveVectorStore(filePath: string, store: VectorStore): void {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(store, null, 2));
  } catch {}
}

export function vectorStorePath(agentDir: string): string {
  return path.join(agentDir, 'memory.vectors.json');
}

function computeIdf(docCount: number, docs: SparseVector[]): Record<string, number> {
  const df: Record<string, number> = {};
  for (const doc of docs) {
    const seen = new Set(Object.keys(doc));
    for (const term of seen) {
      df[term] = (df[term] || 0) + 1;
    }
  }

  const idf: Record<string, number> = {};
  for (const [term, count] of Object.entries(df)) {
    if (count >= IDF_MIN_COUNT) {
      idf[term] = Math.log((docCount + 1) / (count + 1)) + 1;
    }
  }
  return idf;
}

function tfidfVector(tokens: string[], idf: Record<string, number>, defaultIdf = 0): SparseVector {
  const tf: Record<string, number> = {};
  for (const token of tokens) {
    tf[token] = (tf[token] || 0) + 1;
  }

  const vector: SparseVector = {};
  const maxTf = Math.max(...Object.values(tf), 1);
  for (const [term, count] of Object.entries(tf)) {
    const idfVal = idf[term] || defaultIdf;
    if (idfVal > 0) {
      vector[term] = (count / maxTf) * idfVal;
    }
  }
  return vector;
}

export function buildVectorIndex(
  agentDir: string,
  docIds: string[],
  docTexts: string[]
): { store: VectorStore; success: boolean } {
  if (docIds.length !== docTexts.length || docIds.length === 0) {
    return { success: false, store: emptyStore() };
  }

  // Pass 1: tokenize all docs and compute IDF from raw term presence
  const allTokens: string[][] = [];
  for (const text of docTexts) {
    allTokens.push(tokenize(text));
  }

  const df: Record<string, number> = {};
  for (const tokens of allTokens) {
    const seen = new Set(tokens);
    for (const term of seen) {
      df[term] = (df[term] || 0) + 1;
    }
  }

  const idf: Record<string, number> = {};
  for (const [term, count] of Object.entries(df)) {
    if (count >= IDF_MIN_COUNT) {
      idf[term] = Math.log((docIds.length + 1) / (count + 1)) + 1;
    }
  }

  // Pass 2: build TF-IDF vectors
  const vectors: Record<string, SparseVector> = {};
  for (let i = 0; i < docIds.length; i++) {
    vectors[docIds[i]] = tfidfVector(allTokens[i], idf);
  }

  const store: VectorStore = {
    version: 1,
    updatedAt: new Date().toISOString(),
    docCount: docIds.length,
    idf,
    vectors,
  };

  saveVectorStore(vectorStorePath(agentDir), store);

  return { success: true, store };
}

function emptyStore(): VectorStore {
  return { version: 1, updatedAt: '', docCount: 0, idf: {}, vectors: {} };
}

export function searchSimilar(
  store: VectorStore | null,
  query: string,
  topK: number
): { docId: string; score: number }[] {
  if (!store || Object.keys(store.vectors).length === 0) return [];

  const queryTerms = tokenize(query);
  if (queryTerms.length === 0) return [];

  const queryVec = tfidfVector(queryTerms, store.idf, 1.5);

  const results: { docId: string; score: number }[] = [];
  for (const [docId, vec] of Object.entries(store.vectors)) {
    const score = cosineSimilarity(queryVec, vec);
    if (score > 0) {
      results.push({ docId, score });
    }
  }

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
