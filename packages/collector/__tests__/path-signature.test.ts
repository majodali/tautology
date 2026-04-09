import { describe, it, expect } from 'vitest';
import {
  createTraceId,
  createSpanId,
  componentFQN,
  codeVersion,
  DEFAULT_PATH_SIGNATURE_CONFIG,
} from '@tautology/core';
import type { Span, PathSignatureConfig } from '@tautology/core';
import { computePathSignature } from '../src/path-signature.js';

function makeSpan(fqn: string, children: Span[] = [], overrides?: Partial<Span>): Span {
  return {
    spanId: createSpanId(),
    traceId: createTraceId(),
    parentSpanId: null,
    componentFQN: componentFQN(fqn),
    componentType: 'function',
    codeVersion: codeVersion('1.0'),
    startTime: 0n,
    endTime: 1n,
    threadId: null,
    asyncContextId: null,
    inputRefs: [],
    outputRef: null,
    exceptionRef: null,
    children,
    causalLinks: [],
    tags: {},
    status: 'ok',
    ...overrides,
  };
}

describe('computePathSignature', () => {
  it('produces a 16-char hex string', () => {
    const span = makeSpan('test.fn');
    const sig = computePathSignature(span);
    expect(sig).toMatch(/^[0-9a-f]{16}$/);
  });

  it('is deterministic — same structure produces same signature', () => {
    const span1 = makeSpan('svc.getUser', [makeSpan('repo.findById')]);
    const span2 = makeSpan('svc.getUser', [makeSpan('repo.findById')]);
    expect(computePathSignature(span1)).toBe(computePathSignature(span2));
  });

  it('different structures produce different signatures', () => {
    const a = makeSpan('svc.getUser', [makeSpan('repo.findById')]);
    const b = makeSpan('svc.getUser', [makeSpan('repo.findByEmail')]);
    expect(computePathSignature(a)).not.toBe(computePathSignature(b));
  });

  it('is version-independent — changing codeVersion does not change signature', () => {
    const span1 = makeSpan('svc.getUser', [makeSpan('repo.find')], {
      codeVersion: codeVersion('1.0.0'),
    });
    const span2 = makeSpan('svc.getUser', [makeSpan('repo.find')], {
      codeVersion: codeVersion('2.0.0'),
    });
    expect(computePathSignature(span1)).toBe(computePathSignature(span2));
  });

  it('is timing-independent', () => {
    const span1 = makeSpan('svc.fn', [], { startTime: 100n, endTime: 200n });
    const span2 = makeSpan('svc.fn', [], { startTime: 999n, endTime: 1500n });
    expect(computePathSignature(span1)).toBe(computePathSignature(span2));
  });

  describe('loop collapsing', () => {
    it('collapses consecutive children with same FQN', () => {
      const children = Array.from({ length: 100 }, () => makeSpan('repo.findById'));
      const root = makeSpan('svc.getUsers', children);

      // With loop collapsing
      const sigCollapsed = computePathSignature(root, {
        ...DEFAULT_PATH_SIGNATURE_CONFIG,
        collapseLoops: true,
      });

      // The 100-iteration loop should produce the same signature as a 50-iteration loop
      const children50 = Array.from({ length: 50 }, () => makeSpan('repo.findById'));
      const root50 = makeSpan('svc.getUsers', children50);
      const sigCollapsed50 = computePathSignature(root50, {
        ...DEFAULT_PATH_SIGNATURE_CONFIG,
        collapseLoops: true,
      });

      // Both should collapse to the same structure (one node with loopCount > 1)
      // Actually, loopCount differs (100 vs 50), so signatures will differ.
      // But they should both be different from no-collapse:
      const sigNoCollapse = computePathSignature(root, {
        ...DEFAULT_PATH_SIGNATURE_CONFIG,
        collapseLoops: false,
      });
      expect(sigCollapsed).not.toBe(sigNoCollapse);
    });

    it('does not collapse children with different FQNs', () => {
      const mixed = [
        makeSpan('repo.findById'),
        makeSpan('cache.get'),
        makeSpan('repo.findById'),
      ];
      const root = makeSpan('svc.fn', mixed);
      const sig = computePathSignature(root);

      // All three children should remain distinct
      const collapsed = [
        makeSpan('repo.findById'),
        makeSpan('cache.get'),
      ];
      const rootCollapsed = makeSpan('svc.fn', collapsed);
      const sigDiff = computePathSignature(rootCollapsed);

      expect(sig).not.toBe(sigDiff);
    });
  });

  describe('recursion collapsing', () => {
    it('truncates recursive subtrees', () => {
      // Simulate: factorial(3) → factorial(2) → factorial(1) → factorial(0)
      const leaf = makeSpan('math.factorial');
      const depth1 = makeSpan('math.factorial', [leaf]);
      const depth2 = makeSpan('math.factorial', [depth1]);
      const root = makeSpan('math.factorial', [depth2]);

      const sigRecursive = computePathSignature(root, {
        ...DEFAULT_PATH_SIGNATURE_CONFIG,
        collapseRecursion: true,
      });

      // With recursion collapsing, the recursive children are truncated
      // So a deeper recursion should produce the same signature
      const depth3 = makeSpan('math.factorial', [depth2]);
      const rootDeeper = makeSpan('math.factorial', [depth3]);

      const sigDeeper = computePathSignature(rootDeeper, {
        ...DEFAULT_PATH_SIGNATURE_CONFIG,
        collapseRecursion: true,
      });

      expect(sigRecursive).toBe(sigDeeper);
    });
  });

  describe('max depth', () => {
    it('truncates at max depth', () => {
      const deep = makeSpan('a', [
        makeSpan('b', [
          makeSpan('c', [
            makeSpan('d', [
              makeSpan('e'),
            ]),
          ]),
        ]),
      ]);

      const sigDeep = computePathSignature(deep, {
        ...DEFAULT_PATH_SIGNATURE_CONFIG,
        maxDepth: 3,
      });
      const sigShallow = computePathSignature(deep, {
        ...DEFAULT_PATH_SIGNATURE_CONFIG,
        maxDepth: 2,
      });

      // Different depths should produce different signatures
      expect(sigDeep).not.toBe(sigShallow);
    });
  });

  describe('ignored components', () => {
    it('filters out ignored components', () => {
      const root = makeSpan('svc.fn', [
        makeSpan('logger.info'),
        makeSpan('repo.find'),
      ]);

      const sigWithLogger = computePathSignature(root, DEFAULT_PATH_SIGNATURE_CONFIG);
      const sigWithoutLogger = computePathSignature(root, {
        ...DEFAULT_PATH_SIGNATURE_CONFIG,
        ignoredComponents: [componentFQN('logger.info')],
      });

      expect(sigWithLogger).not.toBe(sigWithoutLogger);
    });
  });
});
