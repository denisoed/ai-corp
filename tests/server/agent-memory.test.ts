import fs from 'fs';
import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.AICORP_HOME = '/tmp/aicorp-test-home';
});

vi.mock('../../../src/server/store', () => ({
  getStore: () => ({
    agents: [
      { id: 'agent-1', slug: 'alpha', workspaceId: 'ws-1' },
    ],
    workspaces: [
      { id: 'ws-1', slug: 'workspace-alpha' },
    ],
    messages: [],
  }),
}));

import { buildRetrievedMemoryContextFromFiles, retrieveMemorySnippetsFromFiles, saveMemory } from '../../../src/server/agent-memory';

describe('agent memory retrieval', () => {
  const agentDir = path.join('/tmp/aicorp-test-home', '.aicorp', 'workspaces', 'workspace-alpha', 'agents', 'alpha');
  const sessionsDir = path.join(agentDir, 'sessions');

  beforeEach(() => {
    fs.rmSync(path.join('/tmp/aicorp-test-home', '.aicorp'), { recursive: true, force: true });
    fs.mkdirSync(sessionsDir, { recursive: true });
  });

  it('retrieves only relevant snippets from session logs', () => {
    const file = path.join(sessionsDir, '2026-04-30.jsonl');
    fs.writeFileSync(file, [
      JSON.stringify({ role: 'user', content: 'Need to fix payment timeout in api gateway', timestamp: '2026-04-30T10:00:00.000Z', source: 'system' }),
      JSON.stringify({ role: 'assistant', content: 'Investigated payment timeout and gateway retries', timestamp: '2026-04-30T10:05:00.000Z', source: 'system' }),
      JSON.stringify({ role: 'user', content: 'Discussed lunch and team sync', timestamp: '2026-04-30T10:10:00.000Z', source: 'system' }),
    ].join('\n'));

    const snippets = retrieveMemorySnippetsFromFiles([path.join(sessionsDir, '2026-04-30.jsonl')], 'payment timeout gateway');

    expect(snippets).toHaveLength(2);
    expect(snippets.join('\n')).toContain('payment timeout');
    expect(snippets.join('\n')).toContain('gateway retries');
    expect(snippets.join('\n')).not.toContain('lunch and team sync');
  });

  it('builds a bounded retrieved context block', () => {
    const file = path.join(sessionsDir, '2026-04-30.jsonl');
    fs.writeFileSync(file, [
      JSON.stringify({ role: 'user', content: 'Repository path is src/server/agent-memory.ts', timestamp: '2026-04-30T10:00:00.000Z', source: 'system' }),
      JSON.stringify({ role: 'assistant', content: 'Updated memory.md and summary limits', timestamp: '2026-04-30T10:01:00.000Z', source: 'system' }),
    ].join('\n'));

    // Semantic search finds the most relevant doc to "memory summary limits src/server"
    const context = buildRetrievedMemoryContextFromFiles([path.join(sessionsDir, '2026-04-30.jsonl')], 'memory summary limits src/server');

    expect(context).toContain('summary limits');
    expect(context.length).toBeLessThanOrEqual(900);
  });

  it('keeps working state and index bounded in saved memory', () => {
    saveMemory({
      agentId: 'agent-1',
      agentName: 'Alpha',
      workspaceId: 'ws-1',
      workspaceName: 'Workspace Alpha',
      workspaceFolder: undefined,
      summary: 'A'.repeat(5000),
      workingState: {
        currentGoal: 'B'.repeat(500),
        openQuestions: Array.from({ length: 10 }, (_, i) => `Question ${i}`),
        constraints: Array.from({ length: 10 }, (_, i) => `Constraint ${i}`),
        importantDecisions: Array.from({ length: 10 }, (_, i) => `Decision ${i}`),
        activeWork: Array.from({ length: 10 }, (_, i) => `Work ${i}`),
      },
      keyFacts: Array.from({ length: 50 }, (_, i) => `Fact ${i}`),
      activeTasks: Array.from({ length: 20 }, (_, i) => ({ title: `Task ${i}`, status: 'In Progress' })),
      recentMessages: Array.from({ length: 20 }, (_, i) => ({
        role: 'user',
        content: `Message ${i} with payment timeout gateway`,
        timestamp: `2026-04-30T10:${String(i).padStart(2, '0')}:00.000Z`,
      })),
      totalMessages: 20,
      totalSessions: 1,
      createdAt: '2026-04-30T09:00:00.000Z',
      retrievalIndex: {
        updatedAt: '2026-04-30T10:00:00.000Z',
        terms: Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`term-${i}`, i + 1])),
      },
    });
    const foundMemoryFile = findLatestMemoryFile('/tmp/aicorp-test-home');
    expect(foundMemoryFile).toBeTruthy();
    if (!foundMemoryFile) return;
    const saved = JSON.parse(fs.readFileSync(foundMemoryFile, 'utf8'));
    const indexFile = foundMemoryFile.replace(/memory\.json$/, 'memory.index.json');
    const index = JSON.parse(fs.readFileSync(indexFile, 'utf8'));

    expect(saved.summary.length).toBeLessThanOrEqual(900);
    expect(saved.workingState).toBeDefined();
    expect(Array.isArray(saved.workingState.openQuestions)).toBe(true);
    expect(saved.keyFacts.length).toBeLessThanOrEqual(12);
    expect(saved.activeTasks.length).toBeLessThanOrEqual(6);
    expect(saved.retrievalIndex).toBeUndefined();
    expect(Object.keys(index.terms).length).toBeLessThanOrEqual(80);
    const memoryMdFile = foundMemoryFile.replace(/memory\.json$/, 'memory.md');
    expect(fs.readFileSync(memoryMdFile, 'utf8')).toContain('Current goal:');
  });

});

function findLatestMemoryFile(home: string): string | null {
  const root = path.join(home, '.aicorp');
  const candidates: string[] = [];

  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name === 'memory.json') {
        candidates.push(full);
      }
    }
  };

  walk(root);
  candidates.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return candidates[0] || null;
}
