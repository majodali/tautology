/**
 * SignatureStore — persists known path signatures so we can detect novel paths.
 *
 * For v1, stores signatures in memory and optionally persists to a JSON file.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { PathSignature } from '@tautology/core';
import { pathSignature } from '@tautology/core';

export class SignatureStore {
  private signatures = new Set<PathSignature>();
  private filePath: string | null;

  constructor(filePath?: string) {
    this.filePath = filePath ?? null;
  }

  /**
   * Load signatures from the persistent file, if it exists.
   */
  load(): void {
    if (!this.filePath) return;
    try {
      const content = readFileSync(this.filePath, 'utf-8');
      const data = JSON.parse(content) as string[];
      this.signatures = new Set(data.map(s => pathSignature(s)));
    } catch {
      // File doesn't exist or is invalid — start fresh
      this.signatures = new Set();
    }
  }

  /**
   * Save signatures to the persistent file.
   */
  save(): void {
    if (!this.filePath) return;
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      const data = Array.from(this.signatures);
      writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.error('[tautology] Failed to save signature store:', err);
    }
  }

  has(sig: PathSignature): boolean {
    return this.signatures.has(sig);
  }

  add(sig: PathSignature): void {
    this.signatures.add(sig);
  }

  get size(): number {
    return this.signatures.size;
  }

  clear(): void {
    this.signatures.clear();
  }

  /**
   * Get all known signatures.
   */
  getAll(): PathSignature[] {
    return Array.from(this.signatures);
  }
}
