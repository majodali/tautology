/**
 * Extracts mocked dependency calls from a span tree.
 *
 * Walks the span tree depth-first from the entry point span. Children whose
 * componentFQN matches a dependency pattern are extracted as MockedCalls.
 * Children matching include patterns are considered internal and their
 * subtrees are also walked for more dependencies.
 *
 * The call ordering is preserved: callIndex reflects the order in which
 * dependency calls occurred during the original execution.
 */

import type { Span, MockedCall, FixtureValue, SerializedValueStore } from '@tautology/core';
import { createBoundaryMatcher } from '@tautology/instrument';
import type { BoundaryConfig } from '@tautology/core';
import { resolveToFixtureValue, resolveInputs } from './value-converter.js';

export interface CallExtractorConfig {
  /** Patterns matching dependency components (to be mocked) */
  dependencyPatterns: string[];
  /** Patterns matching internal components (walked but not mocked) */
  internalPatterns: string[];
}

/**
 * Extract mocked calls from a span's children.
 * Dependencies are mocked; internals are walked for deeper dependencies.
 */
export function extractMockedCalls(
  entrySpan: Span,
  config: CallExtractorConfig,
  valueStore: SerializedValueStore,
): MockedCall[] {
  const depMatcher = createBoundaryMatcher({
    include: config.dependencyPatterns,
    exclude: [],
    overrides: {},
    serialization: { defaultSizeThreshold: 0, defaultMaxDepth: 0, alwaysFullTypes: [], neverSerializeTypes: [] },
    pathSignature: { maxDepth: 0, collapseRecursion: false, collapseLoops: false, includeComponentTypes: false, ignoredComponents: [] },
    storage: { outputDir: '', memoryBufferSize: 0, flushOnExit: false },
  } satisfies BoundaryConfig);

  const calls: MockedCall[] = [];
  let callIndex = 0;

  function walk(span: Span): void {
    for (const child of span.children) {
      if (depMatcher.matches(child.componentFQN)) {
        // This is a dependency call — extract as MockedCall
        const inputs = resolveInputs(child.inputRefs, valueStore);

        let returnValue: FixtureValue | null = null;
        let throwException: FixtureValue | null = null;

        if (child.exceptionRef) {
          throwException = resolveToFixtureValue(child.exceptionRef.objectId, valueStore);
        } else if (child.outputRef) {
          returnValue = resolveToFixtureValue(child.outputRef.objectId, valueStore);
        }

        calls.push({
          componentFQN: child.componentFQN,
          callIndex: callIndex++,
          expectedInputs: inputs,
          returnValue,
          throwException,
        });
      } else {
        // Internal call — recurse to find deeper dependencies
        walk(child);
      }
    }
  }

  walk(entrySpan);
  return calls;
}
