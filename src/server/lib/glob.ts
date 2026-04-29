/**
 * Glob matching for file permission scopes.
 * Supports *, **, and ? wildcards.
 */

/**
 * Check if a file path matches a glob pattern.
 * Supports ** (any depth), * (single segment match), ? (single char).
 */
export function matchesGlob(filePath: string, pattern: string): boolean {
  const parts = pattern.split('/');
  const pathParts = filePath.split('/');

  let pi = 0;
  let fi = 0;

  while (pi < parts.length && fi < pathParts.length) {
    const pp = parts[pi];
    const fp = pathParts[fi];

    if (pp === '**') {
      if (pi === parts.length - 1) return true;
      pi++;
      const rest = parts.slice(pi).join('/');
      for (let i = fi; i < pathParts.length; i++) {
        if (matchesGlob(pathParts.slice(i).join('/'), rest)) return true;
      }
      return false;
    }

    if (!matchSegment(fp, pp)) return false;

    pi++;
    fi++;
  }

  if (fi < pathParts.length) return false;
  while (pi < parts.length && parts[pi] === '**') pi++;
  return pi === parts.length;
}

/**
 * Match a single path segment against a glob pattern segment.
 */
function matchSegment(name: string, pattern: string): boolean {
  if (pattern === '*') return true;
  if (pattern === '**') return true;

  let ni = 0;
  let pi = 0;
  let starIdx = -1;
  let matchIdx = 0;

  while (ni < name.length) {
    if (pi < pattern.length && pattern[pi] === '*') {
      starIdx = pi;
      matchIdx = ni;
      pi++;
    } else if (pi < pattern.length && (pattern[pi] === '?' || pattern[pi] === name[ni])) {
      ni++;
      pi++;
    } else if (starIdx !== -1) {
      pi = starIdx + 1;
      matchIdx++;
      ni = matchIdx;
    } else {
      return false;
    }
  }

  while (pi < pattern.length && pattern[pi] === '*') pi++;
  return pi === pattern.length;
}
