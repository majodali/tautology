import { describe, it, expect, beforeEach } from 'vitest';
import { resetObjectIdCounter, createSpanId, createValueStore } from '@tautology/core';
import { ProxySerializer } from '../src/serializer.js';

describe('ProxySerializer', () => {
  const spanId = createSpanId();

  beforeEach(() => {
    resetObjectIdCounter();
  });

  describe('strategy selection', () => {
    it('uses "full" for primitives', () => {
      const serializer = new ProxySerializer();

      expect(serializer.serialize('hello', spanId).strategy).toBe('full');
      expect(serializer.serialize(42, spanId).strategy).toBe('full');
      expect(serializer.serialize(true, spanId).strategy).toBe('full');
      expect(serializer.serialize(null, spanId).strategy).toBe('full');
      expect(serializer.serialize(undefined, spanId).strategy).toBe('full');
    });

    it('uses "full" for small objects', () => {
      const serializer = new ProxySerializer({ sizeThreshold: 16384 });
      const result = serializer.serialize({ name: 'Alice' }, spanId);
      expect(result.strategy).toBe('full');
    });

    it('uses "tracked" for large objects', () => {
      const serializer = new ProxySerializer({ sizeThreshold: 100 }); // Low threshold
      const largeObj = { data: 'x'.repeat(200) };
      const result = serializer.serialize(largeObj, spanId);
      expect(result.strategy).toBe('tracked');
      expect(result.proxiedValue).toBeDefined();
    });

    it('uses "reference" for already-seen objects', () => {
      const serializer = new ProxySerializer();
      const obj = { name: 'Alice' };

      const first = serializer.serialize(obj, spanId);
      const second = serializer.serialize(obj, spanId);

      expect(first.strategy).toBe('full');
      expect(second.strategy).toBe('reference');
      expect(second.objectId).toBe(first.objectId);
    });
  });

  describe('full serialization', () => {
    it('stores value in the value store', () => {
      const store = createValueStore();
      const serializer = new ProxySerializer({}, store);

      const result = serializer.serialize({ name: 'Alice', age: 30 }, spanId);

      expect(store.values.has(result.objectId)).toBe(true);
      const sv = store.values.get(result.objectId)!;
      expect(sv.typeTag).toBe('object');
      expect(sv.data).toEqual({ name: 'Alice', age: 30 });
    });

    it('serializes nested objects', () => {
      const store = createValueStore();
      const serializer = new ProxySerializer({}, store);

      serializer.serialize(
        { user: { name: 'Alice', scores: [10, 20, 30] } },
        spanId,
      );

      const sv = [...store.values.values()][0];
      expect(sv.data).toEqual({
        user: { name: 'Alice', scores: [10, 20, 30] },
      });
    });

    it('serializes Dates', () => {
      const store = createValueStore();
      const serializer = new ProxySerializer({}, store);

      const date = new Date('2024-06-15T10:30:00.000Z');
      serializer.serialize(date, spanId);

      const sv = [...store.values.values()][0];
      expect(sv.typeTag).toBe('Date');
      expect(sv.data).toBe('2024-06-15T10:30:00.000Z');
    });

    it('serializes Errors', () => {
      const store = createValueStore();
      const serializer = new ProxySerializer({}, store);

      const err = new TypeError('bad input');
      serializer.serialize(err, spanId);

      const sv = [...store.values.values()][0];
      expect(sv.typeTag).toBe('Error');
      expect((sv.data as { message: string }).message).toBe('bad input');
      expect((sv.data as { name: string }).name).toBe('TypeError');
    });
  });

  describe('tracked serialization', () => {
    it('returns a usable proxy', () => {
      const serializer = new ProxySerializer({ sizeThreshold: 100 });
      const large = { data: 'x'.repeat(200), name: 'test' };
      const result = serializer.serialize(large, spanId);

      expect(result.strategy).toBe('tracked');
      const proxy = result.proxiedValue as typeof large;
      expect(proxy.name).toBe('test');
      expect(proxy.data).toBe('x'.repeat(200));
    });

    it('creates placeholder in store', () => {
      const store = createValueStore();
      const serializer = new ProxySerializer({ sizeThreshold: 100 }, store);
      const large = { data: 'x'.repeat(200) };
      const result = serializer.serialize(large, spanId);

      const sv = store.values.get(result.objectId)!;
      expect(sv.data).toBeNull(); // placeholder until flush
    });

    it('tracks access paths through the proxy', () => {
      const store = createValueStore();
      const serializer = new ProxySerializer({ sizeThreshold: 100 }, store);
      const large = { data: 'x'.repeat(200), nested: { value: 42 } };
      const result = serializer.serialize(large, spanId);

      const proxy = result.proxiedValue as typeof large;
      const _val = proxy.nested.value;

      const sv = store.values.get(result.objectId)!;
      expect(sv.accessedPaths).toContainEqual(['nested']);
      expect(sv.accessedPaths).toContainEqual(['nested', 'value']);
    });
  });

  describe('never-serialize types', () => {
    it('creates a placeholder for never-serialize types', () => {
      const store = createValueStore();
      const serializer = new ProxySerializer(
        { neverSerializeTypes: ['Map'] },
        store,
      );

      const m = new Map([['a', 1]]);
      const result = serializer.serialize(m, spanId);

      const sv = store.values.get(result.objectId)!;
      expect(sv.data).toContain('not serialized');
    });
  });

  describe('always-full types', () => {
    it('forces full serialization even for large objects', () => {
      const store = createValueStore();
      const serializer = new ProxySerializer(
        { sizeThreshold: 100, alwaysFullTypes: ['Error'] },
        store,
      );

      // Error with a long stack trace may exceed threshold but should still be full
      const err = new Error('x'.repeat(200));
      const result = serializer.serialize(err, spanId);
      expect(result.strategy).toBe('full');
    });
  });

  describe('reset', () => {
    it('clears identity map and store', () => {
      const serializer = new ProxySerializer();
      const obj = { name: 'Alice' };

      serializer.serialize(obj, spanId);
      serializer.reset();

      // Same object should get a new ObjectId
      const result = serializer.serialize(obj, spanId);
      expect(result.strategy).toBe('full'); // not 'reference'
    });
  });
});
