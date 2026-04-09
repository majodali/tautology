/**
 * TraceStorage — writes completed traces to JSON files.
 *
 * Handles bigint serialization (converts to string with 'n' suffix)
 * and Map serialization (converts to array of entries).
 *
 * File format: .tautology/traces/<traceId>.json
 */

import { writeFileSync, readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Trace, TraceId } from '@tautology/core';

export class TraceStorage {
  private outputDir: string;
  private buffer: Trace[] = [];
  private maxBuffer: number;

  constructor(outputDir: string, maxBuffer = 100) {
    this.outputDir = outputDir;
    this.maxBuffer = maxBuffer;
  }

  /**
   * Store a trace. Writes to disk immediately if buffer is full.
   */
  store(trace: Trace): void {
    this.buffer.push(trace);
    if (this.buffer.length >= this.maxBuffer) {
      this.flush();
    }
  }

  /**
   * Flush all buffered traces to disk.
   */
  flush(): void {
    if (this.buffer.length === 0) return;

    mkdirSync(this.outputDir, { recursive: true });

    for (const trace of this.buffer) {
      const filePath = join(this.outputDir, `${trace.traceId}.json`);
      try {
        const json = JSON.stringify(trace, traceReplacer, 2);
        writeFileSync(filePath, json, 'utf-8');
      } catch (err) {
        console.error(`[tautology] Failed to write trace ${trace.traceId}:`, err);
      }
    }

    this.buffer = [];
  }

  /**
   * Load a trace from disk by ID.
   */
  load(traceId: TraceId): Trace | null {
    const filePath = join(this.outputDir, `${traceId}.json`);
    try {
      const content = readFileSync(filePath, 'utf-8');
      return JSON.parse(content, traceReviver) as Trace;
    } catch {
      return null;
    }
  }

  /**
   * List all trace IDs stored on disk.
   */
  list(): TraceId[] {
    try {
      const files = readdirSync(this.outputDir);
      return files
        .filter(f => f.endsWith('.json'))
        .map(f => f.replace('.json', '') as TraceId);
    } catch {
      return [];
    }
  }

  /**
   * Get the number of buffered (unflushed) traces.
   */
  get bufferedCount(): number {
    return this.buffer.length;
  }
}

/**
 * JSON replacer that handles bigint and Map serialization.
 */
function traceReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') {
    return value.toString() + 'n';
  }
  if (value instanceof Map) {
    return {
      __type: 'Map',
      entries: Array.from(value.entries()),
    };
  }
  return value;
}

/**
 * JSON reviver that restores bigint and Map values.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function traceReviver(this: unknown, _key: string, value: unknown): unknown {
  // Restore bigint strings
  if (typeof value === 'string' && /^\d+n$/.test(value)) {
    return BigInt(value.slice(0, -1));
  }
  // Restore Maps
  if (
    value !== null &&
    typeof value === 'object' &&
    (value as Record<string, unknown>)['__type'] === 'Map' &&
    Array.isArray((value as Record<string, unknown>)['entries'])
  ) {
    return new Map((value as { entries: [unknown, unknown][] }).entries);
  }
  return value;
}

// Export for testing
export { traceReplacer, traceReviver };
