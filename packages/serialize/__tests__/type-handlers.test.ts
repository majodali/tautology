import { describe, it, expect } from 'vitest';
import { findHandler, findHandlerByTag, getTypeTag, registerTypeHandler } from '../src/type-handlers.js';

describe('type handlers', () => {
  describe('getTypeTag', () => {
    it('identifies primitives', () => {
      expect(getTypeTag(null)).toBe('null');
      expect(getTypeTag(undefined)).toBe('undefined');
      expect(getTypeTag(true)).toBe('boolean');
      expect(getTypeTag(42)).toBe('number');
      expect(getTypeTag(42n)).toBe('bigint');
      expect(getTypeTag('hello')).toBe('string');
      expect(getTypeTag(Symbol('x'))).toBe('symbol');
      expect(getTypeTag(() => {})).toBe('function');
    });

    it('identifies built-in types', () => {
      expect(getTypeTag(new Date())).toBe('Date');
      expect(getTypeTag(/abc/)).toBe('RegExp');
      expect(getTypeTag(new Error('x'))).toBe('Error');
      expect(getTypeTag(new Map())).toBe('Map');
      expect(getTypeTag(new Set())).toBe('Set');
      expect(getTypeTag(Buffer.from('x'))).toBe('Buffer');
    });

    it('identifies plain objects and arrays', () => {
      expect(getTypeTag({})).toBe('object');
      expect(getTypeTag([])).toBe('array');
    });
  });

  describe('Date handler', () => {
    const handler = findHandlerByTag('Date')!;

    it('round-trips Date values', () => {
      const d = new Date('2024-01-15T12:00:00.000Z');
      const serialized = handler.serialize(d);
      const deserialized = handler.deserialize(serialized) as Date;
      expect(deserialized).toBeInstanceOf(Date);
      expect(deserialized.getTime()).toBe(d.getTime());
    });
  });

  describe('RegExp handler', () => {
    const handler = findHandlerByTag('RegExp')!;

    it('round-trips RegExp values', () => {
      const re = /foo\d+/gi;
      const serialized = handler.serialize(re);
      const deserialized = handler.deserialize(serialized) as RegExp;
      expect(deserialized).toBeInstanceOf(RegExp);
      expect(deserialized.source).toBe(re.source);
      expect(deserialized.flags).toBe(re.flags);
    });
  });

  describe('Error handler', () => {
    const handler = findHandlerByTag('Error')!;

    it('round-trips Error values', () => {
      const err = new TypeError('something failed');
      const serialized = handler.serialize(err);
      const deserialized = handler.deserialize(serialized) as Error;
      expect(deserialized).toBeInstanceOf(Error);
      expect(deserialized.message).toBe('something failed');
      expect(deserialized.name).toBe('TypeError');
    });
  });

  describe('Map handler', () => {
    const handler = findHandlerByTag('Map')!;

    it('round-trips Map values', () => {
      const m = new Map<string, number>([['a', 1], ['b', 2]]);
      const serialized = handler.serialize(m);
      const deserialized = handler.deserialize(serialized) as Map<string, number>;
      expect(deserialized).toBeInstanceOf(Map);
      expect(deserialized.get('a')).toBe(1);
      expect(deserialized.get('b')).toBe(2);
    });
  });

  describe('Set handler', () => {
    const handler = findHandlerByTag('Set')!;

    it('round-trips Set values', () => {
      const s = new Set([1, 2, 3]);
      const serialized = handler.serialize(s);
      const deserialized = handler.deserialize(serialized) as Set<number>;
      expect(deserialized).toBeInstanceOf(Set);
      expect(deserialized.has(1)).toBe(true);
      expect(deserialized.has(2)).toBe(true);
      expect(deserialized.size).toBe(3);
    });
  });

  describe('Buffer handler', () => {
    const handler = findHandlerByTag('Buffer')!;

    it('round-trips Buffer values', () => {
      const buf = Buffer.from('hello world');
      const serialized = handler.serialize(buf);
      expect(typeof serialized).toBe('string'); // base64
      const deserialized = handler.deserialize(serialized) as Buffer;
      expect(Buffer.isBuffer(deserialized)).toBe(true);
      expect(deserialized.toString()).toBe('hello world');
    });
  });

  describe('BigInt handler', () => {
    const handler = findHandlerByTag('BigInt')!;

    it('round-trips BigInt values', () => {
      const big = 9007199254740993n;
      const serialized = handler.serialize(big);
      const deserialized = handler.deserialize(serialized) as bigint;
      expect(deserialized).toBe(big);
    });
  });

  describe('custom type handler', () => {
    it('can register and use a custom handler', () => {
      class Point { constructor(public x: number, public y: number) {} }

      registerTypeHandler({
        typeTag: 'Point',
        detect: (v) => v instanceof Point,
        serialize: (v) => ({ x: (v as Point).x, y: (v as Point).y }),
        deserialize: (d) => {
          const data = d as { x: number; y: number };
          return new Point(data.x, data.y);
        },
      });

      const p = new Point(3, 4);
      const handler = findHandler(p)!;
      expect(handler).not.toBeNull();
      expect(handler.typeTag).toBe('Point');

      const serialized = handler.serialize(p);
      const deserialized = handler.deserialize(serialized) as Point;
      expect(deserialized).toBeInstanceOf(Point);
      expect(deserialized.x).toBe(3);
      expect(deserialized.y).toBe(4);
    });
  });
});
