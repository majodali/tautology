import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  componentFQN,
  codeVersion,
  pathSignature,
  createTraceId,
} from '@tautology/core';
import type { TestFixture } from '@tautology/core';
import { FixtureStore } from '../src/fixture-store.js';

function makeFixture(id: string): TestFixture {
  return {
    fixtureId: id,
    name: `test-fixture-${id}`,
    generatedAt: new Date().toISOString(),
    codeVersion: codeVersion('1.0'),
    entryPoint: {
      componentFQN: componentFQN('svc.getUser'),
      componentType: 'function',
    },
    inputs: [{ typeTag: 'string', data: 'user-123' }],
    expectedOutput: { typeTag: 'object', data: { id: 'user-123', name: 'Alice' } },
    expectedException: null,
    mockedDependencies: [],
    expectedSideEffects: [],
    sourcePathSignature: pathSignature('abc123'),
    sourceTraceId: createTraceId(),
  };
}

describe('FixtureStore', () => {
  let tempDir: string;
  let store: FixtureStore;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'tautology-fixtures-'));
    store = new FixtureStore(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('saves and loads a fixture', () => {
    const fixture = makeFixture('fix-001');
    store.save(fixture);

    const loaded = store.load('fix-001');
    expect(loaded).not.toBeNull();
    expect(loaded!.fixtureId).toBe('fix-001');
    expect(loaded!.name).toBe('test-fixture-fix-001');
    expect(loaded!.inputs).toEqual([{ typeTag: 'string', data: 'user-123' }]);
  });

  it('lists fixture IDs', () => {
    store.save(makeFixture('a'));
    store.save(makeFixture('b'));
    store.save(makeFixture('c'));

    const ids = store.list();
    expect(ids).toHaveLength(3);
    expect(ids.sort()).toEqual(['a', 'b', 'c']);
  });

  it('loads all fixtures', () => {
    store.save(makeFixture('x'));
    store.save(makeFixture('y'));

    const all = store.loadAll();
    expect(all).toHaveLength(2);
  });

  it('deletes a fixture', () => {
    store.save(makeFixture('del-me'));
    expect(store.count).toBe(1);

    const deleted = store.delete('del-me');
    expect(deleted).toBe(true);
    expect(store.count).toBe(0);
    expect(store.load('del-me')).toBeNull();
  });

  it('returns null for non-existent fixture', () => {
    expect(store.load('nope')).toBeNull();
  });

  it('returns false when deleting non-existent fixture', () => {
    expect(store.delete('nope')).toBe(false);
  });

  it('reports count', () => {
    expect(store.count).toBe(0);
    store.save(makeFixture('one'));
    expect(store.count).toBe(1);
    store.save(makeFixture('two'));
    expect(store.count).toBe(2);
  });
});
