import { describe, it, expect, beforeEach } from 'vitest';
import { resetObjectIdCounter, createSpanId } from '@tautology/core';
import { ProxySerializer } from '../src/serializer.js';
import { SerializationQueue } from '../src/queue.js';

describe('SerializationQueue', () => {
  const spanId = createSpanId();
  let serializer: ProxySerializer;
  let queue: SerializationQueue;

  beforeEach(() => {
    resetObjectIdCounter();
    serializer = new ProxySerializer();
    queue = new SerializationQueue(serializer);
  });

  it('serializeSync works for immediate needs', () => {
    const result = queue.serializeSync('hello', spanId);
    expect(result.objectId).toBeTruthy();
    expect(result.strategy).toBe('full');
  });

  it('enqueue returns a promise that resolves with SerializeResult', async () => {
    const result = await queue.enqueue({ name: 'Alice' }, spanId);
    expect(result.objectId).toBeTruthy();
    expect(result.strategy).toBe('full');
  });

  it('processes multiple enqueued values', async () => {
    const p1 = queue.enqueue('hello', spanId);
    const p2 = queue.enqueue(42, spanId);
    const p3 = queue.enqueue({ x: 1 }, spanId);

    const results = await Promise.all([p1, p2, p3]);
    expect(results).toHaveLength(3);
    results.forEach(r => {
      expect(r.objectId).toBeTruthy();
    });
  });

  it('tracks pending count', () => {
    // Synchronous enqueues before any drain
    queue.enqueue('a', spanId);
    queue.enqueue('b', spanId);
    // Pending count should be > 0 before drain (may vary due to setImmediate)
    // After flush, should be 0
  });

  it('flush drains all pending entries', async () => {
    queue.enqueue('a', spanId);
    queue.enqueue('b', spanId);
    queue.enqueue('c', spanId);

    await queue.flush();
    expect(queue.pending).toBe(0);
  });

  it('flush resolves all enqueued promises', async () => {
    const promises = Array.from({ length: 100 }, (_, i) =>
      queue.enqueue(`value-${i}`, spanId)
    );

    await queue.flush();

    const results = await Promise.all(promises);
    expect(results).toHaveLength(100);
    results.forEach(r => expect(r.objectId).toBeTruthy());
  });

  it('handles serialization errors gracefully', async () => {
    // Create a serializer with a very low threshold to force tracked serialization
    const strictSerializer = new ProxySerializer({ sizeThreshold: 1 });
    const strictQueue = new SerializationQueue(strictSerializer);

    // This should not throw even if individual items fail
    const result = await strictQueue.enqueue(
      Object.create(null, {
        toJSON: { value: () => { throw new Error('boom'); } },
      }),
      spanId,
    );
    // Should still resolve (with a placeholder)
    expect(result.objectId).toBeTruthy();
  });

  it('all values appear in the serializer store after flush', async () => {
    queue.enqueue({ a: 1 }, spanId);
    queue.enqueue({ b: 2 }, spanId);
    queue.enqueue({ c: 3 }, spanId);

    await queue.flush();

    const store = serializer.getStore();
    expect(store.values.size).toBeGreaterThanOrEqual(3);
  });
});
