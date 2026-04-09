import picomatch from 'picomatch';
import type { BoundaryConfig } from '@tautology/core';

export interface BoundaryMatcher {
  matches(fqn: string): boolean;
}

/**
 * Creates a matcher that tests component FQNs against include/exclude patterns.
 * A component is instrumented if it matches at least one include pattern
 * and does not match any exclude pattern.
 */
export function createBoundaryMatcher(config: BoundaryConfig): BoundaryMatcher {
  const includeMatchers = config.include.map(p => picomatch(p));
  const excludeMatchers = config.exclude.map(p => picomatch(p));

  return {
    matches(fqn: string): boolean {
      // Must match at least one include pattern
      const included = includeMatchers.some(m => m(fqn));
      if (!included) return false;

      // Must not match any exclude pattern
      const excluded = excludeMatchers.some(m => m(fqn));
      return !excluded;
    },
  };
}
