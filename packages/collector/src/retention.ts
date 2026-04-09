/**
 * Retention evaluation — decides whether a trace should be kept or discarded.
 *
 * Rules:
 * - Traces with errors are always retained (reason: 'error')
 * - Traces with novel (previously unseen) path signatures are retained (reason: 'novel_path')
 * - Traces following already-seen paths with no errors are discarded (reason: null)
 */

import type { TraceStatus, PathSignature, RetentionReason } from '@tautology/core';
import type { SignatureStore } from './signature-store.js';

export interface RetentionInput {
  status: TraceStatus;
  isNovel: boolean;
  pathSignature: PathSignature | null;
}

export function evaluateRetention(
  input: RetentionInput,
  _signatureStore: SignatureStore,
): RetentionReason | null {
  // Error traces are always retained
  if (input.status === 'error') {
    return 'error';
  }

  // Novel paths are retained
  if (input.isNovel) {
    return 'novel_path';
  }

  // Known path, no errors — discard
  return null;
}
