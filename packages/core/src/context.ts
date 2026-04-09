import { AsyncLocalStorage } from 'node:async_hooks';
import type { TraceId, SpanId } from './types/identity.js';
import { createTraceId, createSpanId } from './types/identity.js';
import type { SpanBuilder } from './span-builder.js';

/**
 * The context maintained per-async-scope during tracing.
 */
export interface SpanContext {
  traceId: TraceId;
  spanId: SpanId;
  parentSpanId: SpanId | null;
  spanBuilder: SpanBuilder | null;
}

/**
 * Manages trace context across async boundaries using AsyncLocalStorage.
 */
export class TraceContextManager {
  private storage = new AsyncLocalStorage<SpanContext>();

  /**
   * Get the current span context, or null if not inside a traced scope.
   */
  getCurrentContext(): SpanContext | null {
    return this.storage.getStore() ?? null;
  }

  /**
   * Run a function within a new root context (new trace).
   */
  runInNewTrace<T>(fn: () => T): T {
    const ctx: SpanContext = {
      traceId: createTraceId(),
      spanId: createSpanId(),
      parentSpanId: null,
      spanBuilder: null,
    };
    return this.storage.run(ctx, fn);
  }

  /**
   * Run a function within a child context (new span in the current trace).
   */
  runInChildContext<T>(fn: () => T, spanBuilder?: SpanBuilder): T {
    const parent = this.getCurrentContext();
    const traceId = parent?.traceId ?? createTraceId();
    const parentSpanId = parent?.spanId ?? null;

    const ctx: SpanContext = {
      traceId,
      spanId: createSpanId(),
      parentSpanId,
      spanBuilder: spanBuilder ?? null,
    };
    return this.storage.run(ctx, fn);
  }

  /**
   * Run a function within an explicit context.
   */
  runInContext<T>(ctx: SpanContext, fn: () => T): T {
    return this.storage.run(ctx, fn);
  }
}
