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
import { TraceAssembler } from '../src/trace-assembler.js';
import { SignatureStore } from '../src/signature-store.js';

describe('full pipeline: instrument → serialize → collector', () => {
  let contextManager: TraceContextManager;
  let eventBus: EventBus;
  let serializer: ProxySerializer;
  let signatureStore: SignatureStore;
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
    serializer = new ProxySerializer({}, createValueStore());
    setGlobalSerializer(serializer);

    signatureStore = new SignatureStore();
    assembler = new TraceAssembler(eventBus, signatureStore);

    completedTraces = [];
    assembler.onTraceComplete = (trace, reason) => {
      completedTraces.push({ trace, reason });
    };
  });

  afterEach(() => {
    setGlobalSerializer(null);
    assembler.destroy();
  });

  it('captures a simple function call as a complete trace', () => {
    const fn = (x: number) => x * 2;
    const wrapped = wrapFunction(
      fn as (...args: unknown[]) => unknown,
      makeOpts('math.double'),
      contextManager,
      eventBus,
    );

    wrapped(21);

    expect(completedTraces).toHaveLength(1);
    const { trace, reason } = completedTraces[0];
    expect(trace.status).toBe('complete');
    expect(trace.rootSpan.componentFQN).toBe('math.double');
    expect(trace.pathSignature).toBeTruthy();
    expect(trace.isNovel).toBe(true);
    expect(reason).toBe('novel_path');
  });

  it('detects novel vs known paths', () => {
    const fn = (x: number) => x * 2;
    const wrapped = wrapFunction(
      fn as (...args: unknown[]) => unknown,
      makeOpts('math.double'),
      contextManager,
      eventBus,
    );

    wrapped(1);
    wrapped(2);

    expect(completedTraces).toHaveLength(2);
    expect(completedTraces[0].trace.isNovel).toBe(true);
    expect(completedTraces[0].reason).toBe('novel_path');
    expect(completedTraces[1].trace.isNovel).toBe(false);
    expect(completedTraces[1].reason).toBeNull();
  });

  it('retains error traces even for known paths', () => {
    let shouldThrow = false;
    const fn = (x: number) => {
      if (shouldThrow) throw new Error('boom');
      return x;
    };
    const wrapped = wrapFunction(
      fn as (...args: unknown[]) => unknown,
      makeOpts('svc.process'),
      contextManager,
      eventBus,
    );

    // Successful run
    wrapped(1);

    // Error run
    shouldThrow = true;
    try {
      wrapped(2);
    } catch {
      // expected
    }

    expect(completedTraces).toHaveLength(2);
    expect(completedTraces[1].trace.status).toBe('error');
    expect(completedTraces[1].reason).toBe('error');
  });

  it('captures nested function calls in the trace tree', () => {
    const inner = (x: number) => x + 1;
    const wrappedInner = wrapFunction(
      inner as (...args: unknown[]) => unknown,
      makeOpts('math.increment'),
      contextManager,
      eventBus,
    );

    const outer = (x: number) => wrappedInner(x) as number;
    const wrappedOuter = wrapFunction(
      outer as (...args: unknown[]) => unknown,
      makeOpts('math.process'),
      contextManager,
      eventBus,
    );

    const result = wrappedOuter(5);
    expect(result).toBe(6);

    // The trace should have nested spans, but note that the assembler
    // sees flat span:start/span:end events. The tree structure is in
    // the Span.children populated by wrap.ts.
    expect(completedTraces).toHaveLength(1);
    const trace = completedTraces[0].trace;
    expect(trace.rootSpan.componentFQN).toBe('math.process');
  });

  it('handles async functions', async () => {
    const fn = async (x: number) => {
      await new Promise(r => setTimeout(r, 5));
      return x * 3;
    };
    const wrapped = wrapFunction(
      fn as (...args: unknown[]) => unknown,
      makeOpts('async.triple'),
      contextManager,
      eventBus,
    );

    const result = await wrapped(7);
    expect(result).toBe(21);

    expect(completedTraces).toHaveLength(1);
    expect(completedTraces[0].trace.status).toBe('complete');
  });

  it('different execution paths produce different signatures', () => {
    let path: 'a' | 'b' = 'a';

    const branchA = () => 'result-a';
    const branchB = () => 'result-b';
    const wrappedA = wrapFunction(
      branchA as (...args: unknown[]) => unknown,
      makeOpts('svc.branchA'),
      contextManager,
      eventBus,
    );
    const wrappedB = wrapFunction(
      branchB as (...args: unknown[]) => unknown,
      makeOpts('svc.branchB'),
      contextManager,
      eventBus,
    );

    const router = () => path === 'a' ? wrappedA() : wrappedB();
    const wrappedRouter = wrapFunction(
      router as (...args: unknown[]) => unknown,
      makeOpts('svc.router'),
      contextManager,
      eventBus,
    );

    path = 'a';
    wrappedRouter();

    path = 'b';
    wrappedRouter();

    expect(completedTraces).toHaveLength(2);
    // Both should be novel since they're different paths
    expect(completedTraces[0].trace.isNovel).toBe(true);
    expect(completedTraces[1].trace.isNovel).toBe(true);
    expect(completedTraces[0].trace.pathSignature)
      .not.toBe(completedTraces[1].trace.pathSignature);
  });
});
