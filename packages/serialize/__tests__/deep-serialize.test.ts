import { describe, it, expect, beforeEach } from 'vitest';
import { resetObjectIdCounter } from '@tautology/core';
import {
  deepSerialize,
  createSerializeContext,
  DEFAULT_DEEP_SERIALIZE_CONFIG,
  type SerializeContext,
} from '../src/deep-serialize.js';

describe('deepSerialize', () => {
  let ctx: SerializeContext;

  beforeEach(() => {
    resetObjectIdCounter();
    ctx = createSerializeContext();
  });

  it('serializes primitives', () => {
    deepSerialize('hello', DEFAULT_DEEP_SERIALIZE_CONFIG, ctx);
    const sv = [...ctx.produced.values()][0];
    expect(sv.typeTag).toBe('string');
    expect(sv.data).toBe('hello');
  });

  it('serializes null', () => {
    deepSerialize(null, DEFAULT_DEEP_SERIALIZE_CONFIG, ctx);
    const sv = [...ctx.produced.values()][0];
    expect(sv.typeTag).toBe('null');
    expect(sv.data).toBeNull();
  });

  it('serializes numbers', () => {
    deepSerialize(42, DEFAULT_DEEP_SERIALIZE_CONFIG, ctx);
    const sv = [...ctx.produced.values()][0];
    expect(sv.typeTag).toBe('number');
    expect(sv.data).toBe(42);
  });

  it('serializes booleans', () => {
    deepSerialize(true, DEFAULT_DEEP_SERIALIZE_CONFIG, ctx);
    const sv = [...ctx.produced.values()][0];
    expect(sv.data).toBe(true);
  });

  it('serializes bigints as strings', () => {
    deepSerialize(42n, DEFAULT_DEEP_SERIALIZE_CONFIG, ctx);
    const sv = [...ctx.produced.values()][0];
    expect(sv.typeTag).toBe('bigint');
    expect(sv.data).toBe('42n');
  });

  it('serializes plain objects', () => {
    deepSerialize({ name: 'Alice', age: 30 }, DEFAULT_DEEP_SERIALIZE_CONFIG, ctx);
    const sv = [...ctx.produced.values()][0];
    expect(sv.typeTag).toBe('object');
    expect(sv.data).toEqual({ name: 'Alice', age: 30 });
  });

  it('serializes arrays', () => {
    deepSerialize([1, 2, 3], DEFAULT_DEEP_SERIALIZE_CONFIG, ctx);
    const sv = [...ctx.produced.values()][0];
    expect(sv.typeTag).toBe('array');
    expect(sv.data).toEqual([1, 2, 3]);
  });

  it('serializes nested objects', () => {
    deepSerialize(
      { user: { name: 'Alice', address: { city: 'NYC' } } },
      DEFAULT_DEEP_SERIALIZE_CONFIG,
      ctx,
    );
    const sv = [...ctx.produced.values()][0];
    expect(sv.data).toEqual({
      user: { name: 'Alice', address: { city: 'NYC' } },
    });
  });

  it('serializes Dates via type handler', () => {
    const d = new Date('2024-01-15T12:00:00.000Z');
    deepSerialize(d, DEFAULT_DEEP_SERIALIZE_CONFIG, ctx);
    const sv = [...ctx.produced.values()][0];
    expect(sv.typeTag).toBe('Date');
    expect(sv.data).toBe('2024-01-15T12:00:00.000Z');
  });

  it('serializes Maps via type handler', () => {
    const m = new Map([['a', 1]]);
    deepSerialize(m, DEFAULT_DEEP_SERIALIZE_CONFIG, ctx);
    const sv = [...ctx.produced.values()][0];
    expect(sv.typeTag).toBe('Map');
    expect(sv.data).toEqual([['a', 1]]);
  });

  it('serializes Errors via type handler', () => {
    const err = new Error('boom');
    deepSerialize(err, DEFAULT_DEEP_SERIALIZE_CONFIG, ctx);
    const sv = [...ctx.produced.values()][0];
    expect(sv.typeTag).toBe('Error');
    expect((sv.data as { message: string }).message).toBe('boom');
  });

  it('handles circular references', () => {
    const a: Record<string, unknown> = { name: 'a' };
    const b: Record<string, unknown> = { name: 'b', ref: a };
    a['ref'] = b;

    deepSerialize(a, DEFAULT_DEEP_SERIALIZE_CONFIG, ctx);
    const sv = [...ctx.produced.values()][0];
    const data = sv.data as Record<string, unknown>;
    expect(data['name']).toBe('a');
    // The circular reference should be an __ref
    const refData = data['ref'] as Record<string, unknown>;
    expect(refData['name']).toBe('b');
    const circularRef = refData['ref'] as { __ref: string };
    expect(circularRef.__ref).toBeTruthy();
  });

  it('respects max depth', () => {
    const deep = { a: { b: { c: { d: { e: 'deep' } } } } };
    deepSerialize(deep, { maxDepth: 3 }, ctx);
    const sv = [...ctx.produced.values()][0];
    const data = sv.data as Record<string, Record<string, Record<string, unknown>>>;
    expect(data['a']['b']['c']).toBe('[max depth]');
  });

  it('serializes functions as descriptive strings', () => {
    function myFunc() { return 42; }
    deepSerialize(myFunc, DEFAULT_DEEP_SERIALIZE_CONFIG, ctx);
    const sv = [...ctx.produced.values()][0];
    expect(sv.data).toBe('[Function: myFunc]');
  });

  it('records serializedAt timestamp', () => {
    deepSerialize('test', DEFAULT_DEEP_SERIALIZE_CONFIG, ctx);
    const sv = [...ctx.produced.values()][0];
    expect(sv.serializedAt).toBeTypeOf('bigint');
    expect(sv.serializedAt).toBeGreaterThan(0n);
  });
});
