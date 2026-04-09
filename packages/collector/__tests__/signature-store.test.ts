import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathSignature } from '@tautology/core';
import { SignatureStore } from '../src/signature-store.js';

describe('SignatureStore', () => {
  describe('in-memory', () => {
    it('tracks signatures', () => {
      const store = new SignatureStore();
      const sig = pathSignature('abc123');

      expect(store.has(sig)).toBe(false);
      store.add(sig);
      expect(store.has(sig)).toBe(true);
      expect(store.size).toBe(1);
    });

    it('clears all signatures', () => {
      const store = new SignatureStore();
      store.add(pathSignature('a'));
      store.add(pathSignature('b'));
      store.clear();
      expect(store.size).toBe(0);
    });

    it('returns all signatures', () => {
      const store = new SignatureStore();
      store.add(pathSignature('a'));
      store.add(pathSignature('b'));
      const all = store.getAll();
      expect(all).toHaveLength(2);
      expect(all).toContain('a');
      expect(all).toContain('b');
    });
  });

  describe('persistent', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = mkdtempSync(join(tmpdir(), 'tautology-sig-'));
    });

    afterEach(() => {
      rmSync(tempDir, { recursive: true, force: true });
    });

    it('saves and loads signatures', () => {
      const filePath = join(tempDir, 'sigs.json');

      const store1 = new SignatureStore(filePath);
      store1.add(pathSignature('sig1'));
      store1.add(pathSignature('sig2'));
      store1.save();

      const store2 = new SignatureStore(filePath);
      store2.load();
      expect(store2.has(pathSignature('sig1'))).toBe(true);
      expect(store2.has(pathSignature('sig2'))).toBe(true);
      expect(store2.size).toBe(2);
    });

    it('starts fresh if file does not exist', () => {
      const store = new SignatureStore(join(tempDir, 'nonexistent.json'));
      store.load();
      expect(store.size).toBe(0);
    });

    it('creates directories when saving', () => {
      const filePath = join(tempDir, 'nested', 'dir', 'sigs.json');
      const store = new SignatureStore(filePath);
      store.add(pathSignature('test'));
      store.save();

      const store2 = new SignatureStore(filePath);
      store2.load();
      expect(store2.has(pathSignature('test'))).toBe(true);
    });
  });
});
