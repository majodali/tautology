import { describe, it, expect } from 'vitest';
import { createBoundaryMatcher } from '../src/match.js';
import { DEFAULT_BOUNDARY_CONFIG, type BoundaryConfig } from '@tautology/core';

function makeConfig(overrides: Partial<BoundaryConfig>): BoundaryConfig {
  return { ...DEFAULT_BOUNDARY_CONFIG, ...overrides };
}

describe('createBoundaryMatcher', () => {
  it('matches everything with default config', () => {
    const matcher = createBoundaryMatcher(DEFAULT_BOUNDARY_CONFIG);
    expect(matcher.matches('src.services.user-service')).toBe(true);
    expect(matcher.matches('anything')).toBe(true);
  });

  it('excludes node_modules by default', () => {
    const matcher = createBoundaryMatcher(DEFAULT_BOUNDARY_CONFIG);
    // The default exclude pattern is 'node_modules/**' — path-style FQNs match it
    expect(matcher.matches('node_modules/lodash/fp')).toBe(false);
    // Non-node_modules paths still match
    expect(matcher.matches('src.services.user')).toBe(true);
  });

  it('respects include patterns', () => {
    const matcher = createBoundaryMatcher(makeConfig({
      include: ['src.services.**'],
      exclude: [],
    }));
    expect(matcher.matches('src.services.user-service')).toBe(true);
    expect(matcher.matches('src.repositories.user-repo')).toBe(false);
  });

  it('respects exclude patterns', () => {
    const matcher = createBoundaryMatcher(makeConfig({
      include: ['**'],
      exclude: ['src.utils.**'],
    }));
    expect(matcher.matches('src.services.user-service')).toBe(true);
    expect(matcher.matches('src.utils.helpers')).toBe(false);
  });

  it('exclude takes precedence over include', () => {
    const matcher = createBoundaryMatcher(makeConfig({
      include: ['src.**'],
      exclude: ['src.internal.**'],
    }));
    expect(matcher.matches('src.services.user-service')).toBe(true);
    expect(matcher.matches('src.internal.secret')).toBe(false);
  });

  it('supports multiple include patterns', () => {
    const matcher = createBoundaryMatcher(makeConfig({
      include: ['src.services.**', 'src.controllers.**'],
      exclude: [],
    }));
    expect(matcher.matches('src.services.user')).toBe(true);
    expect(matcher.matches('src.controllers.api')).toBe(true);
    expect(matcher.matches('src.utils.helper')).toBe(false);
  });
});
