import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createTraceId,
  createSpanId,
  componentFQN,
  codeVersion,
  pathSignature,
  createValueStore,
} from '@tautology/core';
import type { Trace, Span } from '@tautology/core';
import { TraceStorage, traceReplacer, traceReviver } from '../src/storage.js';

function makeSpan(): Span {
  return {
    spanId: createSpanId(),
    traceId: createTraceId(),
    parentSpanId: null,
    componentFQN: componentFQN('test.fn'),
    componentType: 'function',
    codeVersion: codeVersion('1.0'),
    startTime: 12345678n,
    endTime: 99999999n,
    threadId: null,
    asyncContextId: null,
    inputRefs: [],
    outputRef: null,
    exceptionRef: null,
    children: [],
    causalLinks: [],
    tags: { env: 'test' },
    status: 'ok',
  };
}

function makeTrace(): Trace {
  const rootSpan = makeSpan();
  return {
    traceId: rootSpan.traceId,
    rootSpan,
    startTime: rootSpan.startTime,
    endTime: rootSpan.endTime,
    codeVersions: { 'test.fn': codeVersion('1.0') },
    status: 'complete',
    pathSignature: pathSignature('abc123def456'),
    isNovel: true,
    retentionReason: 'novel_path',
    valueStore: createValueStore(),
  };
}

describe('traceReplacer / traceReviver', () => {
  it('round-trips bigint values', () => {
    const data = { time: 12345678901234n };
    const json = JSON.stringify(data, traceReplacer);
    expect(json).toContain('"12345678901234n"');

    const restored = JSON.parse(json, traceReviver) as typeof data;
    expect(restored.time).toBe(12345678901234n);
  });

  it('round-trips Map values', () => {
    const data = { m: new Map([['a', 1], ['b', 2]]) };
    const json = JSON.stringify(data, traceReplacer);

    const restored = JSON.parse(json, traceReviver) as typeof data;
    expect(restored.m).toBeInstanceOf(Map);
    expect(restored.m.get('a')).toBe(1);
    expect(restored.m.get('b')).toBe(2);
  });

  it('does not corrupt normal strings', () => {
    const data = { name: 'hello world', count: '42' };
    const json = JSON.stringify(data, traceReplacer);
    const restored = JSON.parse(json, traceReviver) as typeof data;
    expect(restored.name).toBe('hello world');
    expect(restored.count).toBe('42'); // Should stay string, doesn't match /^\d+n$/
  });
});

describe('TraceStorage', () => {
  let tempDir: string;
  let storage: TraceStorage;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'tautology-test-'));
    storage = new TraceStorage(tempDir, 10);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('stores and loads a trace', () => {
    const trace = makeTrace();
    storage.store(trace);
    storage.flush();

    const loaded = storage.load(trace.traceId);
    expect(loaded).not.toBeNull();
    expect(loaded!.traceId).toBe(trace.traceId);
    expect(loaded!.status).toBe('complete');
    expect(loaded!.pathSignature).toBe(trace.pathSignature);
  });

  it('preserves bigint timestamps through round-trip', () => {
    const trace = makeTrace();
    storage.store(trace);
    storage.flush();

    const loaded = storage.load(trace.traceId);
    expect(loaded!.rootSpan.startTime).toBe(12345678n);
    expect(loaded!.rootSpan.endTime).toBe(99999999n);
  });

  it('lists stored trace IDs', () => {
    const t1 = makeTrace();
    const t2 = makeTrace();
    storage.store(t1);
    storage.store(t2);
    storage.flush();

    const ids = storage.list();
    expect(ids).toHaveLength(2);
    expect(ids).toContain(t1.traceId);
    expect(ids).toContain(t2.traceId);
  });

  it('returns null for non-existent trace', () => {
    const loaded = storage.load('nonexistent' as any);
    expect(loaded).toBeNull();
  });

  it('auto-flushes when buffer is full', () => {
    // Buffer size is 10
    for (let i = 0; i < 10; i++) {
      storage.store(makeTrace());
    }

    // Should have auto-flushed
    expect(storage.bufferedCount).toBe(0);
    expect(storage.list()).toHaveLength(10);
  });

  it('tracks buffered count', () => {
    storage.store(makeTrace());
    storage.store(makeTrace());
    expect(storage.bufferedCount).toBe(2);

    storage.flush();
    expect(storage.bufferedCount).toBe(0);
  });
});
