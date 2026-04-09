import type { TraceId, SpanId, ComponentFQN, CodeVersion } from './identity.js';
import type { ValueRef } from './values.js';

export type ComponentType = 'function' | 'method' | 'module' | 'middleware' | 'handler';

export type SpanStatus = 'ok' | 'error' | 'timeout';

export interface CausalLink {
  /** The span that causally preceded this one */
  sourceSpanId: SpanId;
  /** Enables cross-tier linking when source is in a different trace */
  sourceTraceId: TraceId;
  /** Semantic relationship */
  relationship: 'triggered_by' | 'continues_from' | 'follows_from';
}

export interface Span {
  spanId: SpanId;
  traceId: TraceId;
  parentSpanId: SpanId | null;

  componentFQN: ComponentFQN;
  componentType: ComponentType;
  codeVersion: CodeVersion;

  /** Nanosecond timestamps from process.hrtime.bigint() */
  startTime: bigint;
  endTime: bigint | null;

  /** Worker thread ID, if relevant */
  threadId: string | null;
  /** AsyncLocalStorage context ID for tracking async flow */
  asyncContextId: string | null;

  /** References to serialized input values */
  inputRefs: ValueRef[];
  /** Reference to serialized return value */
  outputRef: ValueRef | null;
  /** Reference to serialized exception */
  exceptionRef: ValueRef | null;

  /** Child spans (callee spans within this caller) */
  children: Span[];
  /** Secondary causal edges for async fan-in, cross-tier, etc. */
  causalLinks: CausalLink[];

  /** Arbitrary key-value metadata */
  tags: Record<string, string>;
  status: SpanStatus;
}
