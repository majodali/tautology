/**
 * High-resolution timing utilities.
 * Wraps process.hrtime.bigint() for nanosecond precision without floating-point drift.
 */

export function now(): bigint {
  return process.hrtime.bigint();
}

export function elapsedMs(start: bigint, end: bigint): number {
  return Number(end - start) / 1_000_000;
}

export function elapsedUs(start: bigint, end: bigint): number {
  return Number(end - start) / 1_000;
}

export function formatDuration(start: bigint, end: bigint): string {
  const ms = elapsedMs(start, end);
  if (ms < 1) {
    return `${elapsedUs(start, end).toFixed(1)}µs`;
  }
  if (ms < 1000) {
    return `${ms.toFixed(2)}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
}
