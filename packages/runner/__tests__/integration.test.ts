import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  TraceContextManager,
  EventBus,
  componentFQN,
  codeVersion,
  createValueStore,
  resetObjectIdCounter,
} from '@tautology/core';
import type { Trace, RetentionReason } from '@tautology/core';
import { wrapFunction, setGlobalSerializer, type WrapOptions } from '@tautology/instrument';
import { ProxySerializer } from '@tautology/serialize';
import { TraceAssembler, SignatureStore } from '@tautology/collector';
import { FixtureGenerator } from '@tautology/fixtures';
import { FixtureRunner } from '../src/runner.js';

describe('full round-trip: instrument → trace → fixture → run', () => {
  let contextManager: TraceContextManager;
  let eventBus: EventBus;
  let serializer: ProxySerializer;
  let assembler: TraceAssembler;
  let completedTraces: { trace: Trace; reason: RetentionReason | null }[];

  const makeOpts = (fqn: string): WrapOptions => ({
    componentFQN: componentFQN(fqn),
    componentType: 'function',
    codeVersion: codeVersion('1.0.0'),
    captureInputs: true,
    captureOutputs: true,
  });

  beforeEach(() => {
    resetObjectIdCounter();
    contextManager = new TraceContextManager();
    eventBus = new EventBus();
    const store = createValueStore();
    serializer = new ProxySerializer({}, store);
    setGlobalSerializer(serializer);

    const signatureStore = new SignatureStore();
    assembler = new TraceAssembler(eventBus, signatureStore, { valueStore: store });

    completedTraces = [];
    assembler.onTraceComplete = (trace, reason) => {
      completedTraces.push({ trace, reason });
    };
  });

  afterEach(() => {
    setGlobalSerializer(null);
    assembler.destroy();
  });

  it('generated fixture passes against original code', async () => {
    // Set up instrumented functions
    const findUser = (id: string) => ({ id, name: 'Alice' });
    const wrappedFind = wrapFunction(
      findUser as (...args: unknown[]) => unknown,
      makeOpts('repo.findUser'),
      contextManager,
      eventBus,
    );

    const getUser = (userId: string) => {
      const user = wrappedFind(userId) as { id: string; name: string };
      return { ...user, greeting: `Hello ${user.name}` };
    };
    const wrappedGetUser = wrapFunction(
      getUser as (...args: unknown[]) => unknown,
      makeOpts('svc.getUser'),
      contextManager,
      eventBus,
    );

    // Execute to capture trace
    wrappedGetUser('user-1');
    expect(completedTraces).toHaveLength(1);

    // Generate fixture
    const generator = new FixtureGenerator({ dependencyPatterns: ['repo.**'] });
    const fixtures = generator.generate(completedTraces[0].trace);
    expect(fixtures).toHaveLength(1);
    const fixture = fixtures[0];

    // Run fixture against the same wrapped function
    const runner = new FixtureRunner();
    const result = await runner.runWithFunction(fixture, wrappedGetUser);

    expect(result.status).toBe('pass');
    expect(result.outputDiff).toBeNull();
    expect(result.mockMismatches).toHaveLength(0);
  });

  it('generated fixture detects regression when code changes', async () => {
    // Original implementation
    const findUser = (id: string) => ({ id, name: 'Alice' });
    const wrappedFind = wrapFunction(
      findUser as (...args: unknown[]) => unknown,
      makeOpts('repo.findUser'),
      contextManager,
      eventBus,
    );

    const getUser = (userId: string) => {
      const user = wrappedFind(userId) as { id: string; name: string };
      return { ...user, greeting: `Hello ${user.name}` };
    };
    const wrappedGetUser = wrapFunction(
      getUser as (...args: unknown[]) => unknown,
      makeOpts('svc.getUser'),
      contextManager,
      eventBus,
    );

    // Capture trace from original
    wrappedGetUser('user-1');
    const generator = new FixtureGenerator({ dependencyPatterns: ['repo.**'] });
    const fixtures = generator.generate(completedTraces[0].trace);

    // "Modified" implementation — greeting format changed
    const getUserV2 = (userId: string) => {
      const user = wrappedFind(userId) as { id: string; name: string };
      return { ...user, greeting: `Hi ${user.name}!` }; // Changed from "Hello X" to "Hi X!"
    };
    const wrappedGetUserV2 = wrapFunction(
      getUserV2 as (...args: unknown[]) => unknown,
      makeOpts('svc.getUser'),
      contextManager,
      eventBus,
    );

    // Run fixture against modified code
    const runner = new FixtureRunner();
    const result = await runner.runWithFunction(fixtures[0], wrappedGetUserV2);

    expect(result.status).toBe('fail');
    expect(result.outputDiff).not.toBeNull();
    // The diff should point to the greeting field
    expect(result.outputDiff!.some(d =>
      d.path.includes('greeting') &&
      d.expected === 'Hello Alice' &&
      d.actual === 'Hi Alice!'
    )).toBe(true);
  });

  it('generated fixture catches error regression', async () => {
    // Original: function throws
    const failingFn = (_id: string) => { throw new Error('not found'); };
    const wrappedFailing = wrapFunction(
      failingFn as (...args: unknown[]) => unknown,
      makeOpts('svc.getUser'),
      contextManager,
      eventBus,
    );

    try { wrappedFailing('user-404'); } catch { /* expected */ }
    expect(completedTraces).toHaveLength(1);

    const generator = new FixtureGenerator();
    const fixtures = generator.generate(completedTraces[0].trace);

    // Run fixture — the same function should still produce the same error
    const runner = new FixtureRunner();
    const result = await runner.runWithFunction(fixtures[0], wrappedFailing);

    expect(result.status).toBe('pass');
  });

  it('detects when error is fixed (behavior change)', async () => {
    // Capture trace from failing function
    const failingFn = (_id: string) => { throw new Error('not found'); };
    const wrappedFailing = wrapFunction(
      failingFn as (...args: unknown[]) => unknown,
      makeOpts('svc.getUser'),
      contextManager,
      eventBus,
    );

    try { wrappedFailing('user-404'); } catch { /* expected */ }

    const generator = new FixtureGenerator();
    const fixtures = generator.generate(completedTraces[0].trace);

    // Now the "fixed" function returns normally
    const fixedFn = (_id: string) => ({ id: _id, name: 'Found!' });
    const wrappedFixed = wrapFunction(
      fixedFn as (...args: unknown[]) => unknown,
      makeOpts('svc.getUser'),
      contextManager,
      eventBus,
    );

    const runner = new FixtureRunner();
    const result = await runner.runWithFunction(fixtures[0], wrappedFixed);

    // Fixture expected an exception but function returned normally — should fail
    expect(result.status).toBe('fail');
  });
});
