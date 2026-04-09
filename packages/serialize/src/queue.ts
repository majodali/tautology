/**
 * SerializationQueue — defers serialization off the hot path.
 *
 * When a traced function is called, we want to capture its inputs/outputs
 * without blocking the function's execution. The queue accepts raw values
 * and schedules their serialization via setImmediate callbacks.
 *
 * The queue holds strong references to raw values to prevent GC before
 * they're serialized. Call flush() at trace completion to ensure all
 * values are serialized before the trace is finalized.
 */

import type { SpanId } from '@tautology/core';
import { type ProxySerializer, type SerializeResult } from './serializer.js';

interface QueueEntry {
  value: unknown;
  spanId: SpanId;
  resolve: (result: SerializeResult) => void;
}

export class SerializationQueue {
  private queue: QueueEntry[] = [];
  private draining = false;
  private serializer: ProxySerializer;

  constructor(serializer: ProxySerializer) {
    this.serializer = serializer;
  }

  /**
   * Enqueue a value for deferred serialization.
   * Returns a promise that resolves with the SerializeResult when done.
   */
  enqueue(value: unknown, spanId: SpanId): Promise<SerializeResult> {
    return new Promise<SerializeResult>((resolve) => {
      this.queue.push({ value, spanId, resolve });
      this.scheduleDrain();
    });
  }

  /**
   * Synchronously serialize a value (bypasses the queue).
   * Use for small values where the overhead of queuing exceeds the cost of serialization.
   */
  serializeSync(value: unknown, spanId: SpanId): SerializeResult {
    return this.serializer.serialize(value, spanId);
  }

  /**
   * Flush all pending entries. Returns when the queue is fully drained.
   */
  async flush(): Promise<void> {
    // Process all remaining entries synchronously
    while (this.queue.length > 0) {
      this.drainBatch();
    }
    // Flush tracked proxies
    this.serializer.flushTracked();
  }

  /**
   * Number of entries waiting to be serialized.
   */
  get pending(): number {
    return this.queue.length;
  }

  private scheduleDrain(): void {
    if (this.draining) return;
    this.draining = true;
    setImmediate(() => {
      this.drainBatch();
      this.draining = false;
      // If more entries were added during drain, schedule another
      if (this.queue.length > 0) {
        this.scheduleDrain();
      }
    });
  }

  /**
   * Process a batch of entries. Processes up to batchSize entries per tick
   * to avoid starving the event loop.
   */
  private drainBatch(batchSize = 50): void {
    const batch = this.queue.splice(0, batchSize);
    for (const entry of batch) {
      try {
        const result = this.serializer.serialize(entry.value, entry.spanId);
        entry.resolve(result);
      } catch (err) {
        // Serialization failure shouldn't break the queue
        console.error('[tautology] Serialization error:', err);
        // Resolve with a placeholder
        entry.resolve(this.serializer.serialize(
          `[serialization error: ${err instanceof Error ? err.message : String(err)}]`,
          entry.spanId,
        ));
      }
    }
  }
}
