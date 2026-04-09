import { describe, it, expect } from 'vitest';
import { estimateSize } from '../src/size-estimator.js';

describe('estimateSize', () => {
  it('estimates primitives as small', () => {
    expect(estimateSize(null)).toBeLessThan(100);
    expect(estimateSize(undefined)).toBeLessThan(100);
    expect(estimateSize(true)).toBeLessThan(100);
    expect(estimateSize(42)).toBeLessThan(100);
    expect(estimateSize(42n)).toBeLessThan(100);
  });

  it('estimates strings proportional to length', () => {
    const short = estimateSize('hi');
    const long = estimateSize('a'.repeat(10000));
    expect(long).toBeGreaterThan(short);
    expect(long).toBeGreaterThan(10000);
  });

  it('estimates arrays proportional to length', () => {
    const small = estimateSize([1, 2, 3]);
    const large = estimateSize(new Array(1000).fill(0));
    expect(large).toBeGreaterThan(small);
    expect(large).toBeGreaterThan(1000);
  });

  it('estimates objects proportional to key count', () => {
    const small = estimateSize({ a: 1 });
    const large = estimateSize(Object.fromEntries(
      Array.from({ length: 100 }, (_, i) => [`key${i}`, i])
    ));
    expect(large).toBeGreaterThan(small);
  });

  it('estimates Maps proportional to size', () => {
    const small = estimateSize(new Map([['a', 1]]));
    const large = estimateSize(new Map(
      Array.from({ length: 1000 }, (_, i) => [`key${i}`, i] as [string, number])
    ));
    expect(large).toBeGreaterThan(small);
  });

  it('estimates Sets proportional to size', () => {
    const small = estimateSize(new Set([1]));
    const large = estimateSize(new Set(Array.from({ length: 1000 }, (_, i) => i)));
    expect(large).toBeGreaterThan(small);
  });

  it('estimates Dates as small', () => {
    expect(estimateSize(new Date())).toBeLessThan(200);
  });

  it('estimates Buffers including byte length', () => {
    const buf = Buffer.alloc(10000);
    expect(estimateSize(buf)).toBeGreaterThan(10000);
  });

  it('estimates Errors including stack trace', () => {
    const err = new Error('test');
    expect(estimateSize(err)).toBeGreaterThan(100);
  });
});
