import { describe, it, expect, beforeEach } from 'vitest';
import { componentFQN } from '@tautology/core';
import type { MockedCall } from '@tautology/core';
import { MockRegistry } from '../src/mock-registry.js';

function makeCall(fqn: string, index: number, returnData: unknown): MockedCall {
  return {
    componentFQN: componentFQN(fqn),
    callIndex: index,
    expectedInputs: [],
    returnValue: { typeTag: typeof returnData === 'object' ? 'object' : typeof returnData, data: returnData },
    throwException: null,
  };
}

function makeThrowingCall(fqn: string, index: number, message: string): MockedCall {
  return {
    componentFQN: componentFQN(fqn),
    callIndex: index,
    expectedInputs: [],
    returnValue: null,
    throwException: { typeTag: 'Error', data: { name: 'Error', message, stack: null } },
  };
}

describe('MockRegistry', () => {
  let registry: MockRegistry;

  beforeEach(() => {
    registry = new MockRegistry(false); // disable input verification for unit tests
  });

  it('has() returns true for registered FQNs', () => {
    registry.register([makeCall('repo.findUser', 0, { id: '1' })]);
    expect(registry.has(componentFQN('repo.findUser'))).toBe(true);
    expect(registry.has(componentFQN('repo.other'))).toBe(false);
  });

  it('returns mock values in sequence', () => {
    registry.register([
      makeCall('repo.find', 0, 'first'),
      makeCall('repo.find', 1, 'second'),
    ]);

    const mock = registry.get(componentFQN('repo.find'))!;
    expect(mock()).toBe('first');
    expect(mock()).toBe('second');
  });

  it('returns values from different FQNs independently', () => {
    registry.register([
      makeCall('repo.find', 0, 'from-repo'),
      makeCall('cache.get', 1, 'from-cache'),
    ]);

    const repoMock = registry.get(componentFQN('repo.find'))!;
    const cacheMock = registry.get(componentFQN('cache.get'))!;
    expect(repoMock()).toBe('from-repo');
    expect(cacheMock()).toBe('from-cache');
  });

  it('throws mocked exceptions', () => {
    registry.register([makeThrowingCall('db.query', 0, 'connection lost')]);

    const mock = registry.get(componentFQN('db.query'))!;
    expect(() => mock()).toThrow('connection lost');
  });

  it('detects unexpected calls (exhausted queue)', () => {
    registry.register([makeCall('repo.find', 0, 'only-one')]);

    const mock = registry.get(componentFQN('repo.find'))!;
    mock(); // first call ok
    mock(); // second call is unexpected

    const mismatches = registry.verify();
    expect(mismatches.some(m => m.type === 'unexpected_call')).toBe(true);
  });

  it('detects missed calls', () => {
    registry.register([
      makeCall('repo.find', 0, 'result'),
      makeCall('repo.find', 1, 'result2'),
    ]);

    const mock = registry.get(componentFQN('repo.find'))!;
    mock(); // only call once, missing second

    const mismatches = registry.verify();
    expect(mismatches.some(m => m.type === 'missed_call')).toBe(true);
  });

  it('verify returns empty when all calls match', () => {
    registry.register([
      makeCall('repo.find', 0, 'result'),
    ]);

    const mock = registry.get(componentFQN('repo.find'))!;
    mock();

    expect(registry.verify()).toHaveLength(0);
  });

  it('reset clears all state', () => {
    registry.register([makeCall('repo.find', 0, 'result')]);
    registry.reset();
    expect(registry.has(componentFQN('repo.find'))).toBe(false);
    expect(registry.verify()).toHaveLength(0);
  });

  describe('input verification', () => {
    it('detects input mismatches when enabled', () => {
      const verifyingRegistry = new MockRegistry(true);
      verifyingRegistry.register([{
        componentFQN: componentFQN('repo.find'),
        callIndex: 0,
        expectedInputs: [{ typeTag: 'string', data: 'expected-id' }],
        returnValue: { typeTag: 'string', data: 'result' },
        throwException: null,
      }]);

      const mock = verifyingRegistry.get(componentFQN('repo.find'))!;
      mock('wrong-id'); // Pass wrong input

      const mismatches = verifyingRegistry.verify();
      expect(mismatches.some(m => m.type === 'input_mismatch')).toBe(true);
    });
  });
});
