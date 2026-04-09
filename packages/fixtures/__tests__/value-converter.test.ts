import { describe, it, expect, beforeEach } from 'vitest';
import {
  createObjectId,
  resetObjectIdCounter,
  createValueStore,
  now,
} from '@tautology/core';
import type { SerializedValue, FixtureValue } from '@tautology/core';
import {
  toFixtureValue,
  fromFixtureValue,
  resolveToFixtureValue,
  resolveInputs,
} from '../src/value-converter.js';

function makeSV(typeTag: string, data: unknown): SerializedValue {
  return {
    objectId: createObjectId(),
    typeTag,
    data,
    accessedPaths: [],
    serializedAt: now(),
  };
}

describe('toFixtureValue', () => {
  beforeEach(() => resetObjectIdCounter());

  it('strips internal metadata, keeps typeTag and data', () => {
    const sv = makeSV('string', 'hello');
    const fv = toFixtureValue(sv);
    expect(fv).toEqual({ typeTag: 'string', data: 'hello' });
  });

  it('works for objects', () => {
    const sv = makeSV('object', { name: 'Alice', age: 30 });
    const fv = toFixtureValue(sv);
    expect(fv.typeTag).toBe('object');
    expect(fv.data).toEqual({ name: 'Alice', age: 30 });
  });

  it('works for arrays', () => {
    const sv = makeSV('array', [1, 2, 3]);
    const fv = toFixtureValue(sv);
    expect(fv.typeTag).toBe('array');
    expect(fv.data).toEqual([1, 2, 3]);
  });
});

describe('fromFixtureValue', () => {
  it('reconstructs primitives', () => {
    expect(fromFixtureValue({ typeTag: 'null', data: null })).toBeNull();
    expect(fromFixtureValue({ typeTag: 'undefined', data: null })).toBeUndefined();
    expect(fromFixtureValue({ typeTag: 'boolean', data: true })).toBe(true);
    expect(fromFixtureValue({ typeTag: 'number', data: 42 })).toBe(42);
    expect(fromFixtureValue({ typeTag: 'string', data: 'hello' })).toBe('hello');
  });

  it('reconstructs bigints', () => {
    expect(fromFixtureValue({ typeTag: 'bigint', data: '42n' })).toBe(42n);
    expect(fromFixtureValue({ typeTag: 'bigint', data: '42' })).toBe(42n);
  });

  it('reconstructs Dates via handler', () => {
    const result = fromFixtureValue({ typeTag: 'Date', data: '2024-01-15T12:00:00.000Z' });
    expect(result).toBeInstanceOf(Date);
    expect((result as Date).toISOString()).toBe('2024-01-15T12:00:00.000Z');
  });

  it('reconstructs Maps via handler', () => {
    const result = fromFixtureValue({ typeTag: 'Map', data: [['a', 1], ['b', 2]] });
    expect(result).toBeInstanceOf(Map);
    expect((result as Map<string, number>).get('a')).toBe(1);
  });

  it('reconstructs Errors via handler', () => {
    const result = fromFixtureValue({
      typeTag: 'Error',
      data: { name: 'TypeError', message: 'bad input', stack: null },
    });
    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe('bad input');
  });

  it('passes through plain objects', () => {
    const data = { name: 'Alice', scores: [10, 20] };
    const result = fromFixtureValue({ typeTag: 'object', data });
    expect(result).toEqual(data);
  });

  it('passes through arrays', () => {
    const data = [1, 'two', { three: 3 }];
    const result = fromFixtureValue({ typeTag: 'array', data });
    expect(result).toEqual(data);
  });
});

describe('resolveToFixtureValue', () => {
  beforeEach(() => resetObjectIdCounter());

  it('resolves an objectId from the store', () => {
    const store = createValueStore();
    const sv = makeSV('number', 42);
    store.values.set(sv.objectId, sv);

    const fv = resolveToFixtureValue(sv.objectId, store);
    expect(fv).toEqual({ typeTag: 'number', data: 42 });
  });

  it('returns null for missing objectId', () => {
    const store = createValueStore();
    const fv = resolveToFixtureValue(createObjectId(), store);
    expect(fv).toBeNull();
  });
});

describe('resolveInputs', () => {
  beforeEach(() => resetObjectIdCounter());

  it('resolves multiple refs', () => {
    const store = createValueStore();
    const sv1 = makeSV('string', 'user-123');
    const sv2 = makeSV('number', 42);
    store.values.set(sv1.objectId, sv1);
    store.values.set(sv2.objectId, sv2);

    const results = resolveInputs(
      [{ objectId: sv1.objectId }, { objectId: sv2.objectId }],
      store,
    );
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ typeTag: 'string', data: 'user-123' });
    expect(results[1]).toEqual({ typeTag: 'number', data: 42 });
  });

  it('returns undefined placeholder for missing refs', () => {
    const store = createValueStore();
    const results = resolveInputs([{ objectId: createObjectId() }], store);
    expect(results[0]).toEqual({ typeTag: 'undefined', data: null });
  });
});
