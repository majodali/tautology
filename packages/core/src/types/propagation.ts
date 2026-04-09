import type { TraceId, SpanId } from './identity.js';

/**
 * Trace context for cross-tier propagation.
 * Designed now, full implementation in a later phase.
 */
export interface TraceContext {
  traceId: TraceId;
  spanId: SpanId;
}

export function serializeTraceContext(ctx: TraceContext): string {
  return `${ctx.traceId}:${ctx.spanId}`;
}

export function deserializeTraceContext(data: string): TraceContext | null {
  const parts = data.split(':');
  if (parts.length !== 2) return null;
  return {
    traceId: parts[0] as TraceId,
    spanId: parts[1] as SpanId,
  };
}

/**
 * Injects/extracts trace context from a carrier (e.g. HTTP headers).
 */
export interface TracePropagator {
  inject(context: TraceContext, carrier: Record<string, string>): void;
  extract(carrier: Record<string, string>): TraceContext | null;
}

export const TRACE_HEADERS = {
  traceId: 'x-tautology-trace-id',
  spanId: 'x-tautology-span-id',
} as const;

/**
 * Default propagator using Tautology's own headers.
 */
export const defaultPropagator: TracePropagator = {
  inject(context, carrier) {
    carrier[TRACE_HEADERS.traceId] = context.traceId;
    carrier[TRACE_HEADERS.spanId] = context.spanId;
  },
  extract(carrier) {
    const traceId = carrier[TRACE_HEADERS.traceId];
    const spanId = carrier[TRACE_HEADERS.spanId];
    if (!traceId || !spanId) return null;
    return { traceId: traceId as TraceId, spanId: spanId as SpanId };
  },
};
