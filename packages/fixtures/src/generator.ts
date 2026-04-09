/**
 * FixtureGenerator — converts retained traces into test fixtures.
 *
 * Given a trace, produces one or more TestFixture objects:
 * - The root span becomes the entry point
 * - Children matching dependency patterns become MockedCalls
 * - Inputs/outputs are converted to FixtureValues
 * - Side effects (calls to dependencies) are recorded as expectations
 */

import { randomUUID } from 'node:crypto';
import type {
  Trace,
  TestFixture,
  FixtureValue,
  SideEffectExpectation,
  ComponentFQN,
} from '@tautology/core';
import { resolveToFixtureValue, resolveInputs } from './value-converter.js';
import { extractMockedCalls, type CallExtractorConfig } from './call-extractor.js';
import { type FixtureGeneratorConfig, DEFAULT_FIXTURE_GENERATOR_CONFIG } from './config.js';

export class FixtureGenerator {
  private config: FixtureGeneratorConfig;

  constructor(config?: Partial<FixtureGeneratorConfig>) {
    this.config = { ...DEFAULT_FIXTURE_GENERATOR_CONFIG, ...config };
  }

  /**
   * Generate test fixtures from a trace.
   *
   * By default, produces one fixture per trace with the root span as entry point.
   */
  generate(trace: Trace): TestFixture[] {
    const rootSpan = trace.rootSpan;
    const store = trace.valueStore;

    // Resolve entry point inputs
    const inputs = resolveInputs(rootSpan.inputRefs, store);

    // Resolve expected output or exception
    let expectedOutput: FixtureValue | null = null;
    let expectedException: FixtureValue | null = null;

    if (rootSpan.exceptionRef) {
      expectedException = resolveToFixtureValue(rootSpan.exceptionRef.objectId, store);
    } else if (rootSpan.outputRef) {
      expectedOutput = resolveToFixtureValue(rootSpan.outputRef.objectId, store);
    }

    // Extract mocked dependency calls
    const callExtractorConfig: CallExtractorConfig = {
      dependencyPatterns: this.config.dependencyPatterns,
      internalPatterns: this.config.entryPointPatterns,
    };
    const mockedDependencies = extractMockedCalls(rootSpan, callExtractorConfig, store);

    // Build side effect expectations from mocked calls
    const expectedSideEffects: SideEffectExpectation[] = mockedDependencies.map(call => ({
      componentFQN: call.componentFQN,
      expectedInputs: call.expectedInputs,
      callIndex: call.callIndex,
    }));

    // Generate fixture name
    const name = this.generateName(rootSpan.componentFQN, trace);

    const fixture: TestFixture = {
      fixtureId: randomUUID(),
      name,
      generatedAt: new Date().toISOString(),
      codeVersion: rootSpan.codeVersion,

      entryPoint: {
        componentFQN: rootSpan.componentFQN,
        componentType: rootSpan.componentType,
      },

      inputs,
      expectedOutput,
      expectedException,

      mockedDependencies,
      expectedSideEffects,

      sourcePathSignature: trace.pathSignature!,
      sourceTraceId: trace.traceId,
    };

    return [fixture];
  }

  private generateName(fqn: ComponentFQN, trace: Trace): string {
    const baseName = fqn.split('.').pop() ?? fqn;
    const suffix = trace.retentionReason === 'error' ? 'error' : 'success';
    switch (this.config.naming) {
      case 'trace-id':
        return `${baseName}-${trace.traceId.slice(0, 8)}`;
      case 'component-name':
        return `${baseName}-${suffix}`;
      case 'auto':
      default:
        return `${baseName}-${suffix}-${trace.traceId.slice(0, 8)}`;
    }
  }
}
