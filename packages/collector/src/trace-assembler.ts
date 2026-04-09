/**
 * TraceAssembler — listens to span events on the EventBus and assembles
 * complete trace trees.
 *
 * When a root span (parentSpanId === null) starts, a new Trace is created.
 * Child spans are tracked by traceId. When all spans in a trace have ended,
 * the trace is finalized: path signature is computed, retention is evaluated,
 * and the trace is emitted as 'trace:complete'.
 */

import type {
  TraceId,
  SpanId,
  Span,
  Trace,
  TraceStatus,
  RetentionReason,
  EventBus,
  PathSignatureConfig,
  SerializedValueStore,
} from '@tautology/core';
import { createValueStore, DEFAULT_PATH_SIGNATURE_CONFIG } from '@tautology/core';
import { computePathSignature } from './path-signature.js';
import { evaluateRetention } from './retention.js';
import type { SignatureStore } from './signature-store.js';

interface PendingTrace {
  traceId: TraceId;
  rootSpan: Span | null;
  /** All spans in this trace, keyed by spanId */
  spans: Map<SpanId, Span>;
  /** SpanIds that have started but not yet ended */
  pendingSpanIds: Set<SpanId>;
  startTime: bigint;
  valueStore: SerializedValueStore;
}

export interface TraceAssemblerConfig {
  pathSignature: PathSignatureConfig;
  /** Optional shared value store — if provided, all traces share this store */
  valueStore?: SerializedValueStore;
}

const DEFAULT_CONFIG: TraceAssemblerConfig = {
  pathSignature: DEFAULT_PATH_SIGNATURE_CONFIG,
};

export class TraceAssembler {
  private pending = new Map<TraceId, PendingTrace>();
  private config: TraceAssemblerConfig;
  private eventBus: EventBus;
  private signatureStore: SignatureStore;

  /** Callback invoked when a trace is finalized */
  onTraceComplete?: (trace: Trace, reason: RetentionReason | null) => void;

  constructor(
    eventBus: EventBus,
    signatureStore: SignatureStore,
    config?: Partial<TraceAssemblerConfig>,
  ) {
    this.eventBus = eventBus;
    this.signatureStore = signatureStore;
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Subscribe to events
    this.eventBus.on('span:start', this.handleSpanStart.bind(this));
    this.eventBus.on('span:end', this.handleSpanEnd.bind(this) as (span: Span) => void);
  }

  private handleSpanStart(span: Span): void {
    let pending = this.pending.get(span.traceId);

    if (!pending) {
      // New trace
      pending = {
        traceId: span.traceId,
        rootSpan: null,
        spans: new Map(),
        pendingSpanIds: new Set(),
        startTime: span.startTime,
        valueStore: this.config.valueStore ?? createValueStore(),
      };
      this.pending.set(span.traceId, pending);
    }

    pending.spans.set(span.spanId, span);
    pending.pendingSpanIds.add(span.spanId);

    if (span.parentSpanId === null) {
      pending.rootSpan = span;
    }
  }

  private handleSpanEnd(completedSpan: Span): void {
    const spanId = completedSpan.spanId;
    // Find which trace this span belongs to
    for (const [, pending] of this.pending) {
      if (pending.pendingSpanIds.has(spanId)) {
        pending.pendingSpanIds.delete(spanId);

        // Update the span in the map with the completed version
        // (includes children, status, output/exception refs)
        pending.spans.set(spanId, completedSpan);

        // Update rootSpan if this is the root
        if (completedSpan.parentSpanId === null) {
          pending.rootSpan = completedSpan;
        }

        if (pending.pendingSpanIds.size === 0) {
          this.finalizeTrace(pending);
        }
        return;
      }
    }
  }

  private finalizeTrace(pending: PendingTrace): void {
    if (!pending.rootSpan) {
      // No root span — shouldn't happen, but defensive
      this.pending.delete(pending.traceId);
      return;
    }

    // The root span's children were populated by wrap.ts via SpanBuilder.addChild()
    // We need the latest version of the root span. Since the span:start event
    // gives us the initial snapshot, and children are added to the builder,
    // we need to get the final version. For now, use what we have in the map.

    const rootSpan = pending.rootSpan;

    // Compute path signature
    const pathSig = computePathSignature(rootSpan, this.config.pathSignature);

    // Check novelty
    const isNovel = !this.signatureStore.has(pathSig);

    // Determine trace status
    const status: TraceStatus = hasErrors(rootSpan) ? 'error' : 'complete';

    // Evaluate retention
    const retentionReason = evaluateRetention(
      { status, isNovel, pathSignature: pathSig },
      this.signatureStore,
    );

    // Build the trace object
    const trace: Trace = {
      traceId: pending.traceId,
      rootSpan,
      startTime: pending.startTime,
      endTime: rootSpan.endTime,
      codeVersions: collectCodeVersions(rootSpan),
      status,
      pathSignature: pathSig,
      isNovel,
      retentionReason: retentionReason,
      valueStore: pending.valueStore,
    };

    // Register the signature as seen
    this.signatureStore.add(pathSig);

    // Remove from pending
    this.pending.delete(pending.traceId);

    // Emit events
    this.eventBus.emit('trace:complete', trace);

    if (retentionReason) {
      this.eventBus.emit('trace:retained', trace, retentionReason);
    } else {
      this.eventBus.emit('trace:discarded', trace.traceId);
    }

    // Notify callback
    this.onTraceComplete?.(trace, retentionReason);
  }

  /**
   * Get the number of traces currently being assembled.
   */
  get pendingCount(): number {
    return this.pending.size;
  }

  /**
   * Force-finalize all pending traces (e.g., on process exit).
   */
  flushPending(): Trace[] {
    const traces: Trace[] = [];
    for (const [, pending] of this.pending) {
      if (pending.rootSpan) {
        this.finalizeTrace(pending);
      }
    }
    return traces;
  }

  /**
   * Detach from the event bus.
   */
  destroy(): void {
    this.eventBus.removeAllListeners('span:start');
    this.eventBus.removeAllListeners('span:end');
    this.pending.clear();
  }
}

function hasErrors(span: Span): boolean {
  if (span.status === 'error') return true;
  return span.children.some(hasErrors);
}

function collectCodeVersions(span: Span): Record<string, Span['codeVersion']> {
  const versions: Record<string, Span['codeVersion']> = {};
  function walk(s: Span): void {
    if (s.codeVersion) {
      versions[s.componentFQN] = s.codeVersion;
    }
    s.children.forEach(walk);
  }
  walk(span);
  return versions;
}
