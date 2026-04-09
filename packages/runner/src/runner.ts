/**
 * FixtureRunner — executes test fixtures against instrumented code.
 *
 * Steps:
 * 1. Create MockRegistry from fixture's mockedDependencies
 * 2. Inject mocks via setMockOverride
 * 3. Reconstruct inputs from FixtureValues
 * 4. Resolve and invoke the entry point function
 * 5. Compare actual output/exception against expected
 * 6. Verify mock call expectations
 * 7. Return structured FixtureResult
 */

import type { TestFixture } from '@tautology/core';
import { setMockOverride } from '@tautology/instrument';
import { fromFixtureValue } from '@tautology/fixtures';
import { MockRegistry, type MockMismatch } from './mock-registry.js';
import { deepEqual, type ComparisonDiff } from './comparator.js';
import { resolveEntryPoint } from './resolver.js';

export interface RunnerConfig {
  /** Maps FQN prefixes to filesystem module paths */
  moduleMap: Record<string, string>;
  /** Max execution time in ms (default: 5000) */
  timeout: number;
  /** Whether to verify mock inputs match expected (default: true) */
  verifyMockInputs: boolean;
}

export const DEFAULT_RUNNER_CONFIG: RunnerConfig = {
  moduleMap: {},
  timeout: 5000,
  verifyMockInputs: true,
};

export interface FixtureResult {
  fixtureId: string;
  name: string;
  status: 'pass' | 'fail' | 'error';
  duration: number;
  outputDiff: ComparisonDiff[] | null;
  mockMismatches: MockMismatch[];
  runnerError: Error | null;
}

export class FixtureRunner {
  private config: RunnerConfig;

  constructor(config?: Partial<RunnerConfig>) {
    this.config = { ...DEFAULT_RUNNER_CONFIG, ...config };
  }

  /**
   * Run a single fixture and return the result.
   */
  async run(fixture: TestFixture): Promise<FixtureResult> {
    const startTime = performance.now();

    // Set up mock registry
    const registry = new MockRegistry(this.config.verifyMockInputs);
    registry.register(fixture.mockedDependencies);
    setMockOverride(registry);

    try {
      return await this.execute(fixture, registry, startTime);
    } finally {
      // Always clean up mocks
      setMockOverride(null);
    }
  }

  /**
   * Run a fixture using a directly provided function (bypasses module resolution).
   * Useful for testing and for cases where the entry point is already available.
   */
  async runWithFunction(
    fixture: TestFixture,
    fn: (...args: unknown[]) => unknown,
  ): Promise<FixtureResult> {
    const startTime = performance.now();

    const registry = new MockRegistry(this.config.verifyMockInputs);
    registry.register(fixture.mockedDependencies);
    setMockOverride(registry);

    try {
      return await this.executeWithFn(fixture, fn, registry, startTime);
    } finally {
      setMockOverride(null);
    }
  }

  /**
   * Run multiple fixtures and return all results.
   */
  async runAll(fixtures: TestFixture[]): Promise<FixtureResult[]> {
    const results: FixtureResult[] = [];
    for (const fixture of fixtures) {
      results.push(await this.run(fixture));
    }
    return results;
  }

  private async execute(
    fixture: TestFixture,
    registry: MockRegistry,
    startTime: number,
  ): Promise<FixtureResult> {
    // Resolve the entry point function
    let fn: (...args: unknown[]) => unknown;
    try {
      fn = await resolveEntryPoint(fixture, this.config);
    } catch (err) {
      return {
        fixtureId: fixture.fixtureId,
        name: fixture.name,
        status: 'error',
        duration: performance.now() - startTime,
        outputDiff: null,
        mockMismatches: [],
        runnerError: err instanceof Error ? err : new Error(String(err)),
      };
    }

    return this.executeWithFn(fixture, fn, registry, startTime);
  }

  private async executeWithFn(
    fixture: TestFixture,
    fn: (...args: unknown[]) => unknown,
    registry: MockRegistry,
    startTime: number,
  ): Promise<FixtureResult> {
    // Reconstruct inputs
    const inputs = fixture.inputs.map(fv => fromFixtureValue(fv));

    // Execute with timeout
    let actualOutput: unknown;
    let actualException: unknown = null;
    let didThrow = false;

    try {
      const result = fn(...inputs);

      // Handle async results with timeout
      if (result != null && typeof (result as { then?: unknown }).then === 'function') {
        actualOutput = await Promise.race([
          result as Promise<unknown>,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Fixture timeout after ${this.config.timeout}ms`)), this.config.timeout)
          ),
        ]);
      } else {
        actualOutput = result;
      }
    } catch (err) {
      didThrow = true;
      actualException = err;
    }

    const duration = performance.now() - startTime;

    // Compare output/exception
    let outputDiff: ComparisonDiff[] | null = null;
    let status: 'pass' | 'fail' | 'error' = 'pass';

    if (fixture.expectedException) {
      // We expect an exception
      if (!didThrow) {
        status = 'fail';
        outputDiff = [{ path: 'exception', expected: 'should throw', actual: 'did not throw' }];
      } else {
        const expectedErr = fromFixtureValue(fixture.expectedException);
        const result = deepEqual(actualException, expectedErr);
        if (!result.equal) {
          status = 'fail';
          outputDiff = result.diffs;
        }
      }
    } else if (fixture.expectedOutput) {
      // We expect a return value
      if (didThrow) {
        status = 'fail';
        const errMsg = actualException instanceof Error ? actualException.message : String(actualException);
        outputDiff = [{ path: 'exception', expected: 'no exception', actual: errMsg }];
      } else {
        const expectedOutput = fromFixtureValue(fixture.expectedOutput);
        const result = deepEqual(actualOutput, expectedOutput);
        if (!result.equal) {
          status = 'fail';
          outputDiff = result.diffs;
        }
      }
    } else {
      // No expected output or exception — just check no unexpected throw
      if (didThrow) {
        status = 'fail';
        const errMsg = actualException instanceof Error ? actualException.message : String(actualException);
        outputDiff = [{ path: 'exception', expected: 'no exception', actual: errMsg }];
      }
    }

    // Verify mock expectations
    const mockMismatches = registry.verify();
    if (mockMismatches.length > 0 && status === 'pass') {
      status = 'fail';
    }

    return {
      fixtureId: fixture.fixtureId,
      name: fixture.name,
      status,
      duration,
      outputDiff,
      mockMismatches,
      runnerError: null,
    };
  }
}
