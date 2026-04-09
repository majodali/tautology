import type { TraceId, CodeVersion, PathSignature } from './identity.js';
import type { Span } from './span.js';
import type { SerializedValueStore } from './values.js';

export type TraceStatus = 'complete' | 'in_progress' | 'error';

export type RetentionReason = 'error' | 'novel_path' | 'integrity_failure' | 'manual';

export interface Trace {
  traceId: TraceId;
  rootSpan: Span;
  startTime: bigint;
  endTime: bigint | null;

  /** Code versions of deployed units encountered during this trace */
  codeVersions: Record<string, CodeVersion>;
  status: TraceStatus;

  /** Computed path signature for this execution path */
  pathSignature: PathSignature | null;
  /** Whether this is a previously unseen execution path */
  isNovel: boolean;

  /** Why this trace was retained, or null if discarded */
  retentionReason: RetentionReason | null;

  /** All serialized values and mutations for this trace */
  valueStore: SerializedValueStore;
}
