import { describe, it, expect, beforeEach } from 'vitest';
import { resetObjectIdCounter, createObjectId, createSpanId } from '@tautology/core';
import { createTrackedProxy, getTrackingData } from '../src/proxy-tracker.js';

describe('createTrackedProxy', () => {
  const spanId = createSpanId();

  beforeEach(() => {
    resetObjectIdCounter();
  });

  it('reads through to the original object', () => {
    const target = { name: 'Alice', age: 30 };
    const rootId = createObjectId();
    const { proxy } = createTrackedProxy(target, rootId, spanId);

    expect(proxy.name).toBe('Alice');
    expect(proxy.age).toBe(30);
  });

  it('records accessed property paths', () => {
    const target = { user: { name: 'Alice', address: { city: 'NYC' } } };
    const rootId = createObjectId();
    const { proxy, tracking } = createTrackedProxy(target, rootId, spanId);

    // Access nested properties
    const _name = proxy.user.name;
    const _city = proxy.user.address.city;

    // Should have recorded the access paths
    expect(tracking.accessedPaths).toContainEqual(['user']);
    expect(tracking.accessedPaths).toContainEqual(['user', 'name']);
    expect(tracking.accessedPaths).toContainEqual(['user', 'address']);
    expect(tracking.accessedPaths).toContainEqual(['user', 'address', 'city']);
  });

  it('records array index accesses', () => {
    const target = { items: ['a', 'b', 'c'] };
    const rootId = createObjectId();
    const { proxy, tracking } = createTrackedProxy(target, rootId, spanId);

    const _first = proxy.items[0];

    expect(tracking.accessedPaths).toContainEqual(['items']);
    expect(tracking.accessedPaths).toContainEqual(['items', '0']);
  });

  it('records mutations', () => {
    const target = { name: 'Alice', score: 10 };
    const rootId = createObjectId();
    const { proxy, tracking } = createTrackedProxy(target, rootId, spanId);

    proxy.score = 20;

    expect(tracking.mutations).toHaveLength(1);
    expect(tracking.mutations[0].path).toEqual(['score']);
    expect(tracking.mutations[0].objectId).toBe(rootId);
    expect(tracking.mutations[0].timestamp).toBeTypeOf('bigint');
    expect(tracking.mutations[0].spanId).toBe(spanId);

    // The actual value should be updated
    expect(proxy.score).toBe(20);
    expect(target.score).toBe(20);
  });

  it('records nested mutations', () => {
    const target = { user: { name: 'Alice' } };
    const rootId = createObjectId();
    const { proxy, tracking } = createTrackedProxy(target, rootId, spanId);

    proxy.user.name = 'Bob';

    expect(tracking.mutations).toHaveLength(1);
    expect(tracking.mutations[0].path).toEqual(['user', 'name']);
    expect(target.user.name).toBe('Bob');
  });

  it('records delete operations', () => {
    const target: Record<string, unknown> = { a: 1, b: 2 };
    const rootId = createObjectId();
    const { proxy, tracking } = createTrackedProxy(target, rootId, spanId);

    delete proxy['b'];

    expect(tracking.mutations).toHaveLength(1);
    expect(tracking.mutations[0].path).toEqual(['b']);
    expect('b' in target).toBe(false);
  });

  it('returns same nested proxy for repeated access', () => {
    const target = { user: { name: 'Alice' } };
    const rootId = createObjectId();
    const { proxy } = createTrackedProxy(target, rootId, spanId);

    const first = proxy.user;
    const second = proxy.user;
    expect(first).toBe(second);
  });

  it('passes through typeof correctly', () => {
    const target = { fn: () => 42, name: 'test' };
    const rootId = createObjectId();
    const { proxy } = createTrackedProxy(target, rootId, spanId);

    expect(typeof proxy).toBe('object');
    expect(typeof proxy.name).toBe('string');
  });

  it('passes through "in" operator', () => {
    const target = { name: 'Alice' };
    const rootId = createObjectId();
    const { proxy } = createTrackedProxy(target, rootId, spanId);

    expect('name' in proxy).toBe(true);
    expect('missing' in proxy).toBe(false);
  });

  it('passes through Object.keys', () => {
    const target = { a: 1, b: 2, c: 3 };
    const rootId = createObjectId();
    const { proxy } = createTrackedProxy(target, rootId, spanId);

    expect(Object.keys(proxy)).toEqual(['a', 'b', 'c']);
  });

  it('does not proxy primitive-like objects (Date, RegExp)', () => {
    const target = { date: new Date('2024-01-01'), re: /foo/ };
    const rootId = createObjectId();
    const { proxy } = createTrackedProxy(target, rootId, spanId);

    // Accessing these should return the original, not a proxy
    const date = proxy.date;
    expect(date).toBeInstanceOf(Date);
    expect(date.getTime()).toBe(new Date('2024-01-01').getTime());
  });

  it('getTrackingData retrieves tracking from proxy', () => {
    const target = { x: 1 };
    const rootId = createObjectId();
    const { proxy, tracking } = createTrackedProxy(target, rootId, spanId);

    const retrieved = getTrackingData(proxy);
    expect(retrieved).toBe(tracking);
  });

  it('getTrackingData returns null for non-proxy', () => {
    expect(getTrackingData({})).toBeNull();
  });
});
