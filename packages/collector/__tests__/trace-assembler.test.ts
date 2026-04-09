import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  EventBus,
  createTraceId,
  createSpanId,
  componentFQN,
  codeVersion,
  resetObjectIdCounter,
} from '@tautology/core';
import type { Span, Trace, RetentionReason } from '@tautology/core';
import { TraceAssembler } from '../src/trace-assembler.js';
import { SignatureStore } from '../src/signature-store.js';

function makeSpan(
  fqn: string,
  traceId: ReturnType<typeof createTraceId>,
  parentSpanId: ReturnType<typeof createSpanId> | null = null,
  children: Span[] = [],
  overrides?: Partial<Span>,
): Span {
  return {
    spanId: createSpanId(),
    traceId,
    parentSpanId,
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
    children,
    causalLinks: [],
    tags: {},
    status: 'ok',
    ...overrides,
  };
}

describe('TraceAssembler', () => {
  let eventBus: EventBus;
  let signatureStore: SignatureStore;
  let assembler: TraceAssembler;

  beforeEach(() => {
    resetObjectIdCounter();
    eventBus = new EventBus();
    signatureStore = new SignatureStore();
    assembler = new TraceAssembler(eventBus, signatureStore);
  });

  it('assembles a single-span trace', () => {
    const completedTraces: { trace: Trace; reason: RetentionReason | null }[] = [];
    assembler.onTraceComplete = (trace, reason) => {
      completedTraces.push({ trace, reason });
    };

    const traceId = createTraceId();
    const span = makeSpan('svc.getUser', traceId);

    eventBus.emit('span:start', span);
    eventBus.emit('span:end', span);

    expect(completedTraces).toHaveLength(1);
    expect(completedTraces[0].trace.traceId).toBe(traceId);
    expect(completedTraces[0].trace.status).toBe('complete');
    expect(completedTraces[0].trace.pathSignature).toBeTruthy();
  });

  it('first trace is novel, second is not', () => {
    const results: { trace: Trace; reason: RetentionReason | null }[] = [];
    assembler.onTraceComplete = (trace, reason) => {
      results.push({ trace, reason });
    };

    // First trace
    const t1 = createTraceId();
    const s1 = makeSpan('svc.getUser', t1);
    eventBus.emit('span:start', s1);
    eventBus.emit('span:end', s1);

    // Second trace with same structure
    const t2 = createTraceId();
    const s2 = makeSpan('svc.getUser', t2);
    eventBus.emit('span:start', s2);
    eventBus.emit('span:end', s2);

    expect(results).toHaveLength(2);
    expect(results[0].trace.isNovel).toBe(true);
    expect(results[0].reason).toBe('novel_path');
    expect(results[1].trace.isNovel).toBe(false);
    expect(results[1].reason).toBeNull(); // discarded
  });

  it('error traces are always retained', () => {
    const results: { trace: Trace; reason: RetentionReason | null }[] = [];
    assembler.onTraceComplete = (trace, reason) => {
      results.push({ trace, reason });
    };

    // First run a successful trace to make the path known
    const t1 = createTraceId();
    const s1 = makeSpan('svc.getUser', t1);
    eventBus.emit('span:start', s1);
    eventBus.emit('span:end', s1);

    // Now an error trace with the same path
    const t2 = createTraceId();
    const s2 = makeSpan('svc.getUser', t2, null, [], { status: 'error' });
    eventBus.emit('span:start', s2);
    eventBus.emit('span:end', s2);

    expect(results).toHaveLength(2);
    expect(results[1].trace.status).toBe('error');
    expect(results[1].reason).toBe('error');
  });

  it('emits trace:complete and trace:retained events', () => {
    const completeListener = vi.fn();
    const retainedListener = vi.fn();
    eventBus.on('trace:complete', completeListener);
    eventBus.on('trace:retained', retainedListener);

    const traceId = createTraceId();
    const span = makeSpan('svc.fn', traceId);
    eventBus.emit('span:start', span);
    eventBus.emit('span:end', span);

    expect(completeListener).toHaveBeenCalledOnce();
    expect(retainedListener).toHaveBeenCalledOnce(); // novel path
  });

  it('emits trace:discarded for known paths', () => {
    const discardedListener = vi.fn();
    eventBus.on('trace:discarded', discardedListener);

    // First run
    const t1 = createTraceId();
    const s1 = makeSpan('svc.fn', t1);
    eventBus.emit('span:start', s1);
    eventBus.emit('span:end', s1);

    // Second run — same path
    const t2 = createTraceId();
    const s2 = makeSpan('svc.fn', t2);
    eventBus.emit('span:start', s2);
    eventBus.emit('span:end', s2);

    expect(discardedListener).toHaveBeenCalledOnce();
    expect(discardedListener).toHaveBeenCalledWith(t2);
  });

  it('tracks pending count', () => {
    const traceId = createTraceId();
    const span = makeSpan('svc.fn', traceId);

    expect(assembler.pendingCount).toBe(0);
    eventBus.emit('span:start', span);
    expect(assembler.pendingCount).toBe(1);
    eventBus.emit('span:end', span);
    expect(assembler.pendingCount).toBe(0);
  });

  it('registers signatures in the store', () => {
    const traceId = createTraceId();
    const span = makeSpan('svc.fn', traceId);

    eventBus.emit('span:start', span);
    eventBus.emit('span:end', span);

    expect(signatureStore.size).toBe(1);
  });

  it('collects code versions from spans', () => {
    const results: Trace[] = [];
    assembler.onTraceComplete = (trace) => results.push(trace);

    const traceId = createTraceId();
    const span = makeSpan('svc.getUser', traceId, null, [], {
      codeVersion: codeVersion('2.5.0'),
    });

    eventBus.emit('span:start', span);
    eventBus.emit('span:end', span);

    expect(results[0].codeVersions['svc.getUser']).toBe('2.5.0');
  });

  it('destroys cleanly', () => {
    assembler.destroy();
    expect(assembler.pendingCount).toBe(0);
  });
});
