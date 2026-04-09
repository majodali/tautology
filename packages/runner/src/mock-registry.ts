/**
 * MockRegistry — implements the MockOverride interface for fixture execution.
 *
 * Given a fixture's mockedDependencies, sets up call sequences per ComponentFQN.
 * When the instrumented code calls a dependency, the mock returns the recorded
 * value from the fixture instead of calling the real implementation.
 */

import type { ComponentFQN, MockedCall } from '@tautology/core';
import type { MockOverride } from '@tautology/instrument';
import { fromFixtureValue } from '@tautology/fixtures';
import { deepEqual, type ComparisonDiff } from './comparator.js';

export interface MockMismatch {
  componentFQN: ComponentFQN;
  type: 'unexpected_call' | 'missed_call' | 'input_mismatch';
  callIndex: number;
  details?: string;
  inputDiffs?: ComparisonDiff[];
}

interface CallQueue {
  calls: MockedCall[];
  nextIndex: number;
}

export class MockRegistry implements MockOverride {
  private queues = new Map<string, CallQueue>();
  private unexpectedCalls: MockMismatch[] = [];
  private verifyInputs: boolean;

  constructor(verifyInputs = true) {
    this.verifyInputs = verifyInputs;
  }

  /**
   * Register mocked calls from a fixture's mockedDependencies.
   */
  register(calls: MockedCall[]): void {
    // Group by componentFQN
    for (const call of calls) {
      const fqn = call.componentFQN as string;
      let queue = this.queues.get(fqn);
      if (!queue) {
        queue = { calls: [], nextIndex: 0 };
        this.queues.set(fqn, queue);
      }
      queue.calls.push(call);
    }
  }

  has(fqn: ComponentFQN): boolean {
    return this.queues.has(fqn as string);
  }

  get(fqn: ComponentFQN): ((...args: unknown[]) => unknown) | undefined {
    const queue = this.queues.get(fqn as string);
    if (!queue) return undefined;

    return (...args: unknown[]) => {
      if (queue.nextIndex >= queue.calls.length) {
        // No more expected calls — record as unexpected
        this.unexpectedCalls.push({
          componentFQN: fqn,
          type: 'unexpected_call',
          callIndex: queue.nextIndex,
          details: `Extra call to ${fqn} (expected ${queue.calls.length} calls)`,
        });
        return undefined;
      }

      const call = queue.calls[queue.nextIndex];
      queue.nextIndex++;

      // Optionally verify inputs
      if (this.verifyInputs && call.expectedInputs.length > 0) {
        for (let i = 0; i < call.expectedInputs.length; i++) {
          const expected = fromFixtureValue(call.expectedInputs[i]);
          const actual = i < args.length ? args[i] : undefined;
          const result = deepEqual(actual, expected);
          if (!result.equal) {
            this.unexpectedCalls.push({
              componentFQN: fqn,
              type: 'input_mismatch',
              callIndex: call.callIndex,
              details: `Input ${i} mismatch for ${fqn} call #${call.callIndex}`,
              inputDiffs: result.diffs,
            });
          }
        }
      }

      // Return mocked value or throw mocked exception
      if (call.throwException) {
        throw fromFixtureValue(call.throwException);
      }

      if (call.returnValue) {
        return fromFixtureValue(call.returnValue);
      }

      return undefined;
    };
  }

  /**
   * Verify that all expected calls were made and no unexpected calls occurred.
   */
  verify(): MockMismatch[] {
    const mismatches: MockMismatch[] = [...this.unexpectedCalls];

    // Check for missed calls
    for (const [fqn, queue] of this.queues) {
      if (queue.nextIndex < queue.calls.length) {
        for (let i = queue.nextIndex; i < queue.calls.length; i++) {
          mismatches.push({
            componentFQN: fqn as ComponentFQN,
            type: 'missed_call',
            callIndex: queue.calls[i].callIndex,
            details: `Expected call #${queue.calls[i].callIndex} to ${fqn} was never made`,
          });
        }
      }
    }

    return mismatches;
  }

  /**
   * Reset all state for reuse.
   */
  reset(): void {
    this.queues.clear();
    this.unexpectedCalls = [];
  }
}
