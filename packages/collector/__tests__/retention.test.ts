import { describe, it, expect } from 'vitest';
import { pathSignature } from '@tautology/core';
import { evaluateRetention } from '../src/retention.js';
import { SignatureStore } from '../src/signature-store.js';

describe('evaluateRetention', () => {
  it('retains error traces', () => {
    const store = new SignatureStore();
    const sig = pathSignature('abc123');
    store.add(sig); // Even if the path is known

    const result = evaluateRetention(
      { status: 'error', isNovel: false, pathSignature: sig },
      store,
    );
    expect(result).toBe('error');
  });

  it('retains novel path traces', () => {
    const store = new SignatureStore();
    const sig = pathSignature('new-path');

    const result = evaluateRetention(
      { status: 'complete', isNovel: true, pathSignature: sig },
      store,
    );
    expect(result).toBe('novel_path');
  });

  it('discards known successful traces', () => {
    const store = new SignatureStore();
    const sig = pathSignature('known-path');
    store.add(sig);

    const result = evaluateRetention(
      { status: 'complete', isNovel: false, pathSignature: sig },
      store,
    );
    expect(result).toBeNull();
  });

  it('error takes precedence over novel', () => {
    const store = new SignatureStore();
    const result = evaluateRetention(
      { status: 'error', isNovel: true, pathSignature: pathSignature('sig') },
      store,
    );
    expect(result).toBe('error');
  });
});
