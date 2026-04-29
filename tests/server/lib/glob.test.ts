import { describe, it, expect } from 'vitest';
import { matchesGlob } from '../../../src/server/lib/glob';

describe('matchesGlob', () => {
  it('matches exact path', () => {
    expect(matchesGlob('src/index.ts', 'src/index.ts')).toBe(true);
  });

  it('does not match different path', () => {
    expect(matchesGlob('src/index.ts', 'src/main.ts')).toBe(false);
  });

  it('matches single * in segment', () => {
    expect(matchesGlob('src/index.ts', 'src/*.ts')).toBe(true);
  });

  it('matches ** for any depth', () => {
    expect(matchesGlob('src/components/layout/Header.tsx', 'src/**')).toBe(true);
    expect(matchesGlob('deep/nested/path/file.txt', 'src/**')).toBe(false);
  });

  it('matches ** in middle of pattern', () => {
    expect(matchesGlob('src/components/Button.tsx', 'src/**/*.tsx')).toBe(true);
    expect(matchesGlob('src/components/ui/Button.tsx', 'src/**/*.tsx')).toBe(true);
  });

  it('handles ? single char match', () => {
    expect(matchesGlob('file1.txt', 'file?.txt')).toBe(true);
    expect(matchesGlob('file10.txt', 'file?.txt')).toBe(false);
  });

  it('handles glob at end of segment', () => {
    expect(matchesGlob('test_utils.js', 'test_*.js')).toBe(true);
    expect(matchesGlob('test_utilities.js', 'test_*.js')).toBe(true);
    expect(matchesGlob('unit_test.js', 'test_*.js')).toBe(false);
  });

  it('handles complex nested globs', () => {
    expect(matchesGlob('docs/api/reference.md', 'docs/**/*.md')).toBe(true);
    expect(matchesGlob('docs/index.md', 'docs/**/*.md')).toBe(true);
    expect(matchesGlob('docs/api/v2/reference.json', 'docs/**/*.md')).toBe(false);
  });

  it('handles ** at end of pattern', () => {
    expect(matchesGlob('foo/bar/baz', 'foo/**')).toBe(true);
    // 'foo/**' also matches the directory itself (it can reference the dir)
    expect(matchesGlob('foo', 'foo/**')).toBe(true);
    expect(matchesGlob('bar', 'foo/**')).toBe(false);
  });

  it('handles empty segments', () => {
    expect(matchesGlob('', '')).toBe(true);
    expect(matchesGlob('a', '')).toBe(false);
    expect(matchesGlob('', '*')).toBe(true);
  });
});
