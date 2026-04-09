import { describe, it, expect, beforeEach } from 'vitest';
import {
  createTraceId,
  createSpanId,
  createObjectId,
  resetObjectIdCounter,
  componentFQN,
  codeVersion,
  pathSignature,
  createValueStore,
  now,
} from '@tautology/core';
import type { Span, Trace, SerializedValue } from '@tautology/core';
import { FixtureGenerator } from '../src/generator.js';

function makeSV(typeTag: string, data: unknown): SerializedValue {
  return {
    objectId: createObjectId(),
    typeTag,
    data,
    accessedPaths: [],
    serializedAt: now(),
  };
}

function makeSpan(fqn: string, overrides?: Partial<Span>): Span {
  return {
    spanId: createSpanId(),
    traceId: createTraceId(),
    parentSpanId: null,
    componentFQN: componentFQN(fqn),
    componentType: 'function',
    codeVersion: codeVersion('1.0'),
    startTime: 100n,
    endTime: 200n,
    threadId: null,
    asyncContextId: null,
    inputRefs: [],
    outputRef: null,
    exceptionRef: null,
    children: [],
    causalLinks: [],
    tags: {},
    status: 'ok',
    ...overrides,
  };
}

function makeTrace(rootSpan: Span, store = createValueStore()): Trace {
  return {
    traceId: rootSpan.traceId,
    rootSpan,
    startTime: rootSpan.startTime,
    endTime: rootSpan.endTime,
    codeVersions: { [rootSpan.componentFQN]: rootSpan.codeVersion },
    status: rootSpan.status === 'error' ? 'error' : 'complete',
    pathSignature: pathSignature('abc123'),
    isNovel: true,
    retentionReason: 'novel_path',
    valueStore: store,
  };
}

describe('FixtureGenerator', () => {
  beforeEach(() => resetObjectIdCounter());

  it('generates a fixture from a simple trace', () => {
    const store = createValueStore();

    const inputSV = makeSV('string', 'user-123');
    const outputSV = makeSV('object', { id: 'user-123', name: 'Alice' });
    store.values.set(inputSV.objectId, inputSV);
    store.values.set(outputSV.objectId, outputSV);

    const rootSpan = makeSpan('svc.getUser', {
      inputRefs: [{
        objectId: inputSV.objectId,
        serializationStrategy: 'full',
        parameterName: 'userId',
        parameterIndex: 0,
      }],
      outputRef: {
        objectId: outputSV.objectId,
        serializationStrategy: 'full',
        parameterName: null,
        parameterIndex: -1,
      },
    });

    const trace = makeTrace(rootSpan, store);
    const generator = new FixtureGenerator();
    const fixtures = generator.generate(trace);

    expect(fixtures).toHaveLength(1);
    const fixture = fixtures[0];

    expect(fixture.entryPoint.componentFQN).toBe('svc.getUser');
    expect(fixture.entryPoint.componentType).toBe('function');
    expect(fixture.inputs).toHaveLength(1);
    expect(fixture.inputs[0]).toEqual({ typeTag: 'string', data: 'user-123' });
    expect(fixture.expectedOutput).toEqual({
      typeTag: 'object',
      data: { id: 'user-123', name: 'Alice' },
    });
    expect(fixture.expectedException).toBeNull();
    expect(fixture.codeVersion).toBe('1.0');
    expect(fixture.sourceTraceId).toBe(trace.traceId);
    expect(fixture.fixtureId).toBeTruthy();
    expect(fixture.generatedAt).toBeTruthy();
  });

  it('captures exception instead of output for error traces', () => {
    const store = createValueStore();

    const exceptionSV = makeSV('Error', { name: 'Error', message: 'not found', stack: null });
    store.values.set(exceptionSV.objectId, exceptionSV);

    const rootSpan = makeSpan('svc.getUser', {
      status: 'error',
      exceptionRef: {
        objectId: exceptionSV.objectId,
        serializationStrategy: 'full',
        parameterName: null,
        parameterIndex: -1,
      },
    });

    const trace = makeTrace(rootSpan, store);
    const generator = new FixtureGenerator();
    const fixtures = generator.generate(trace);

    expect(fixtures[0].expectedOutput).toBeNull();
    expect(fixtures[0].expectedException).toEqual({
      typeTag: 'Error',
      data: { name: 'Error', message: 'not found', stack: null },
    });
  });

  it('extracts mocked dependency calls', () => {
    const store = createValueStore();

    const inputSV = makeSV('string', 'user-123');
    const depInputSV = makeSV('string', 'user-123');
    const depOutputSV = makeSV('object', { id: 'user-123', name: 'Alice' });
    const outputSV = makeSV('object', { id: 'user-123', name: 'Alice', processed: true });
    store.values.set(inputSV.objectId, inputSV);
    store.values.set(depInputSV.objectId, depInputSV);
    store.values.set(depOutputSV.objectId, depOutputSV);
    store.values.set(outputSV.objectId, outputSV);

    const depSpan = makeSpan('repo.findById', {
      inputRefs: [{
        objectId: depInputSV.objectId,
        serializationStrategy: 'full',
        parameterName: 'id',
        parameterIndex: 0,
      }],
      outputRef: {
        objectId: depOutputSV.objectId,
        serializationStrategy: 'full',
        parameterName: null,
        parameterIndex: -1,
      },
    });

    const rootSpan = makeSpan('svc.getUser', {
      inputRefs: [{
        objectId: inputSV.objectId,
        serializationStrategy: 'full',
        parameterName: 'userId',
        parameterIndex: 0,
      }],
      outputRef: {
        objectId: outputSV.objectId,
        serializationStrategy: 'full',
        parameterName: null,
        parameterIndex: -1,
      },
      children: [depSpan],
    });

    const trace = makeTrace(rootSpan, store);
    const generator = new FixtureGenerator({
      dependencyPatterns: ['repo.**'],
    });
    const fixtures = generator.generate(trace);

    expect(fixtures[0].mockedDependencies).toHaveLength(1);
    const mock = fixtures[0].mockedDependencies[0];
    expect(mock.componentFQN).toBe('repo.findById');
    expect(mock.callIndex).toBe(0);
    expect(mock.expectedInputs[0]).toEqual({ typeTag: 'string', data: 'user-123' });
    expect(mock.returnValue).toEqual({
      typeTag: 'object',
      data: { id: 'user-123', name: 'Alice' },
    });
    expect(mock.throwException).toBeNull();

    // Side effects should match mocked calls
    expect(fixtures[0].expectedSideEffects).toHaveLength(1);
    expect(fixtures[0].expectedSideEffects[0].componentFQN).toBe('repo.findById');
  });

  it('preserves call ordering across multiple dependencies', () => {
    const store = createValueStore();

    const sv1 = makeSV('string', 'check');
    const sv2 = makeSV('string', 'fetch');
    const sv3 = makeSV('string', 'notify');
    store.values.set(sv1.objectId, sv1);
    store.values.set(sv2.objectId, sv2);
    store.values.set(sv3.objectId, sv3);

    const dep1 = makeSpan('cache.get', {
      inputRefs: [{ objectId: sv1.objectId, serializationStrategy: 'full', parameterName: null, parameterIndex: 0 }],
      outputRef: { objectId: sv1.objectId, serializationStrategy: 'full', parameterName: null, parameterIndex: -1 },
    });
    const dep2 = makeSpan('db.query', {
      inputRefs: [{ objectId: sv2.objectId, serializationStrategy: 'full', parameterName: null, parameterIndex: 0 }],
      outputRef: { objectId: sv2.objectId, serializationStrategy: 'full', parameterName: null, parameterIndex: -1 },
    });
    const dep3 = makeSpan('email.send', {
      inputRefs: [{ objectId: sv3.objectId, serializationStrategy: 'full', parameterName: null, parameterIndex: 0 }],
      outputRef: { objectId: sv3.objectId, serializationStrategy: 'full', parameterName: null, parameterIndex: -1 },
    });

    const rootSpan = makeSpan('svc.process', {
      children: [dep1, dep2, dep3],
    });

    const trace = makeTrace(rootSpan, store);
    const generator = new FixtureGenerator({
      dependencyPatterns: ['cache.**', 'db.**', 'email.**'],
    });
    const fixtures = generator.generate(trace);

    const mocks = fixtures[0].mockedDependencies;
    expect(mocks).toHaveLength(3);
    expect(mocks[0].callIndex).toBe(0);
    expect(mocks[0].componentFQN).toBe('cache.get');
    expect(mocks[1].callIndex).toBe(1);
    expect(mocks[1].componentFQN).toBe('db.query');
    expect(mocks[2].callIndex).toBe(2);
    expect(mocks[2].componentFQN).toBe('email.send');
  });

  it('generates fixture with naming strategy', () => {
    const rootSpan = makeSpan('svc.getUser');
    const trace = makeTrace(rootSpan);

    const gen = new FixtureGenerator({ naming: 'component-name' });
    const fixtures = gen.generate(trace);
    expect(fixtures[0].name).toMatch(/^getUser-/);
  });
});
