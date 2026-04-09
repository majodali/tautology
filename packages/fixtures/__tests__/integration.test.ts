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
import { FixtureGenerator } from '../src/generator.js';
import { fromFixtureValue } from '../src/value-converter.js';

describe('full pipeline: instrument → serialize → collect → fixture', () => {
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

  it('generates a fixture from a live instrumented function', () => {
    // Set up a "service" function that calls a "repository" dependency
    const findUser = (id: string) => ({ id, name: 'Alice', email: 'alice@test.com' });
    const wrappedFind = wrapFunction(
      findUser as (...args: unknown[]) => unknown,
      makeOpts('repo.findUser'),
      contextManager,
      eventBus,
    );

    const getUser = (userId: string) => {
      const user = wrappedFind(userId) as { id: string; name: string; email: string };
      return { ...user, displayName: user.name.toUpperCase() };
    };
    const wrappedGetUser = wrapFunction(
      getUser as (...args: unknown[]) => unknown,
      makeOpts('svc.getUser'),
      contextManager,
      eventBus,
    );

    // Execute the function
    const result = wrappedGetUser('user-123');
    expect(result).toEqual({
      id: 'user-123',
      name: 'Alice',
      email: 'alice@test.com',
      displayName: 'ALICE',
    });

    // Trace should be captured
    expect(completedTraces).toHaveLength(1);
    const trace = completedTraces[0].trace;

    // Generate fixture with repo.* as dependency
    const generator = new FixtureGenerator({
      dependencyPatterns: ['repo.**'],
    });
    const fixtures = generator.generate(trace);

    expect(fixtures).toHaveLength(1);
    const fixture = fixtures[0];

    // Entry point should be svc.getUser
    expect(fixture.entryPoint.componentFQN).toBe('svc.getUser');

    // Input should be 'user-123'
    expect(fixture.inputs).toHaveLength(1);
    expect(fixture.inputs[0].typeTag).toBe('string');
    expect(fixture.inputs[0].data).toBe('user-123');

    // Output should be the processed user
    expect(fixture.expectedOutput).not.toBeNull();
    expect(fixture.expectedOutput!.typeTag).toBe('object');
    const outputData = fixture.expectedOutput!.data as Record<string, unknown>;
    expect(outputData['displayName']).toBe('ALICE');

    // Mocked dependency: repo.findUser
    expect(fixture.mockedDependencies).toHaveLength(1);
    const mock = fixture.mockedDependencies[0];
    expect(mock.componentFQN).toBe('repo.findUser');
    expect(mock.expectedInputs[0].data).toBe('user-123');
    expect(mock.returnValue).not.toBeNull();
    const mockReturn = mock.returnValue!.data as Record<string, unknown>;
    expect(mockReturn['name']).toBe('Alice');

    // Values should be reconstructable
    const reconstructedInput = fromFixtureValue(fixture.inputs[0]);
    expect(reconstructedInput).toBe('user-123');
  });

  it('generates a fixture from an error trace', () => {
    const failingFn = (_id: string) => { throw new Error('DB connection failed'); };
    const wrappedFailing = wrapFunction(
      failingFn as (...args: unknown[]) => unknown,
      makeOpts('svc.getUser'),
      contextManager,
      eventBus,
    );

    try {
      wrappedFailing('user-456');
    } catch {
      // expected
    }

    expect(completedTraces).toHaveLength(1);
    const trace = completedTraces[0].trace;

    const generator = new FixtureGenerator();
    const fixtures = generator.generate(trace);

    expect(fixtures[0].expectedOutput).toBeNull();
    expect(fixtures[0].expectedException).not.toBeNull();
    expect(fixtures[0].expectedException!.typeTag).toBe('Error');
    const errData = fixtures[0].expectedException!.data as { message: string };
    expect(errData.message).toBe('DB connection failed');
  });

  it('generates fixtures with multiple dependency calls in order', () => {
    const checkCache = (key: string) => null as unknown;
    const queryDb = (id: string) => ({ id, name: 'Bob' });
    const sendNotification = (userId: string) => true;

    const wrappedCache = wrapFunction(checkCache as (...args: unknown[]) => unknown, makeOpts('cache.get'), contextManager, eventBus);
    const wrappedDb = wrapFunction(queryDb as (...args: unknown[]) => unknown, makeOpts('db.findUser'), contextManager, eventBus);
    const wrappedNotify = wrapFunction(sendNotification as (...args: unknown[]) => unknown, makeOpts('notify.send'), contextManager, eventBus);

    const processRequest = (userId: string) => {
      wrappedCache(userId);
      const user = wrappedDb(userId);
      wrappedNotify(userId);
      return user;
    };
    const wrappedProcess = wrapFunction(processRequest as (...args: unknown[]) => unknown, makeOpts('svc.processRequest'), contextManager, eventBus);

    wrappedProcess('user-789');

    const trace = completedTraces[0].trace;
    const generator = new FixtureGenerator({
      dependencyPatterns: ['cache.**', 'db.**', 'notify.**'],
    });
    const fixtures = generator.generate(trace);
    const mocks = fixtures[0].mockedDependencies;

    expect(mocks).toHaveLength(3);
    expect(mocks[0].componentFQN).toBe('cache.get');
    expect(mocks[0].callIndex).toBe(0);
    expect(mocks[1].componentFQN).toBe('db.findUser');
    expect(mocks[1].callIndex).toBe(1);
    expect(mocks[2].componentFQN).toBe('notify.send');
    expect(mocks[2].callIndex).toBe(2);
  });
});
