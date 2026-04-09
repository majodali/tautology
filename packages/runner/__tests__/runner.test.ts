import { describe, it, expect } from 'vitest';
import {
  componentFQN,
  codeVersion,
  pathSignature,
  createTraceId,
} from '@tautology/core';
import type { TestFixture } from '@tautology/core';
import { FixtureRunner } from '../src/runner.js';

function makeFixture(overrides?: Partial<TestFixture>): TestFixture {
  return {
    fixtureId: 'test-fix-001',
    name: 'test-fixture',
    generatedAt: new Date().toISOString(),
    codeVersion: codeVersion('1.0'),
    entryPoint: {
      componentFQN: componentFQN('test.fn'),
      componentType: 'function',
    },
    inputs: [{ typeTag: 'number', data: 21 }],
    expectedOutput: { typeTag: 'number', data: 42 },
    expectedException: null,
    mockedDependencies: [],
    expectedSideEffects: [],
    sourcePathSignature: pathSignature('sig123'),
    sourceTraceId: createTraceId(),
    ...overrides,
  };
}

describe('FixtureRunner', () => {
  const runner = new FixtureRunner();

  it('passes when output matches expected', async () => {
    const fixture = makeFixture({
      inputs: [{ typeTag: 'number', data: 21 }],
      expectedOutput: { typeTag: 'number', data: 42 },
    });

    const fn = (x: number) => x * 2;
    const result = await runner.runWithFunction(fixture, fn as (...args: unknown[]) => unknown);

    expect(result.status).toBe('pass');
    expect(result.outputDiff).toBeNull();
    expect(result.mockMismatches).toHaveLength(0);
  });

  it('fails when output does not match', async () => {
    const fixture = makeFixture({
      inputs: [{ typeTag: 'number', data: 10 }],
      expectedOutput: { typeTag: 'number', data: 42 },
    });

    const fn = (x: number) => x * 3; // Returns 30, not 42
    const result = await runner.runWithFunction(fixture, fn as (...args: unknown[]) => unknown);

    expect(result.status).toBe('fail');
    expect(result.outputDiff).not.toBeNull();
    expect(result.outputDiff!.length).toBeGreaterThan(0);
  });

  it('passes when expected exception matches', async () => {
    const fixture = makeFixture({
      inputs: [{ typeTag: 'string', data: 'bad' }],
      expectedOutput: null,
      expectedException: { typeTag: 'Error', data: { name: 'Error', message: 'invalid input', stack: null } },
    });

    const fn = () => { throw new Error('invalid input'); };
    const result = await runner.runWithFunction(fixture, fn as (...args: unknown[]) => unknown);

    expect(result.status).toBe('pass');
  });

  it('fails when function throws but no exception expected', async () => {
    const fixture = makeFixture({
      expectedOutput: { typeTag: 'number', data: 42 },
      expectedException: null,
    });

    const fn = () => { throw new Error('unexpected'); };
    const result = await runner.runWithFunction(fixture, fn as (...args: unknown[]) => unknown);

    expect(result.status).toBe('fail');
    expect(result.outputDiff!.some(d => d.path === 'exception')).toBe(true);
  });

  it('fails when exception expected but function returns normally', async () => {
    const fixture = makeFixture({
      inputs: [],
      expectedOutput: null,
      expectedException: { typeTag: 'Error', data: { name: 'Error', message: 'should throw', stack: null } },
    });

    const fn = () => 'no error';
    const result = await runner.runWithFunction(fixture, fn as (...args: unknown[]) => unknown);

    expect(result.status).toBe('fail');
  });

  it('handles async functions', async () => {
    const fixture = makeFixture({
      inputs: [{ typeTag: 'number', data: 5 }],
      expectedOutput: { typeTag: 'number', data: 10 },
    });

    const fn = async (x: number) => {
      await new Promise(r => setTimeout(r, 5));
      return x * 2;
    };
    const result = await runner.runWithFunction(fixture, fn as (...args: unknown[]) => unknown);

    expect(result.status).toBe('pass');
  });

  it('handles mocked dependencies', async () => {
    const fixture = makeFixture({
      inputs: [{ typeTag: 'string', data: 'user-1' }],
      expectedOutput: { typeTag: 'object', data: { id: 'user-1', name: 'Alice' } },
      mockedDependencies: [{
        componentFQN: componentFQN('repo.find'),
        callIndex: 0,
        expectedInputs: [],
        returnValue: { typeTag: 'object', data: { id: 'user-1', name: 'Alice' } },
        throwException: null,
      }],
    });

    // This function doesn't actually call repo.find since mocks are injected
    // via setMockOverride which intercepts wrapped functions.
    // For this unit test, we test the mock verification logic directly.
    const fn = () => ({ id: 'user-1', name: 'Alice' });
    const result = await runner.runWithFunction(fixture, fn as (...args: unknown[]) => unknown);

    // Output matches, but mock was never called → missed_call
    expect(result.status).toBe('fail');
    expect(result.mockMismatches.some(m => m.type === 'missed_call')).toBe(true);
  });

  it('times out on long-running functions', async () => {
    const shortRunner = new FixtureRunner({ timeout: 50 });
    const fixture = makeFixture({
      inputs: [],
      expectedOutput: { typeTag: 'string', data: 'done' },
    });

    const fn = async () => {
      await new Promise(r => setTimeout(r, 5000));
      return 'done';
    };

    const result = await shortRunner.runWithFunction(fixture, fn as (...args: unknown[]) => unknown);
    expect(result.status).toBe('fail');
  });

  it('records duration', async () => {
    const fixture = makeFixture();
    const fn = (x: number) => x * 2;
    const result = await runner.runWithFunction(fixture, fn as (...args: unknown[]) => unknown);
    expect(result.duration).toBeGreaterThan(0);
  });

  it('includes fixtureId and name in result', async () => {
    const fixture = makeFixture({ fixtureId: 'my-fix', name: 'My Fixture' });
    const fn = (x: number) => x * 2;
    const result = await runner.runWithFunction(fixture, fn as (...args: unknown[]) => unknown);
    expect(result.fixtureId).toBe('my-fix');
    expect(result.name).toBe('My Fixture');
  });
});
