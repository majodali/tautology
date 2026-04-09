import { describe, it, expect } from 'vitest';
import { deepEqual } from '../src/comparator.js';

describe('deepEqual', () => {
  describe('primitives', () => {
    it('equal primitives', () => {
      expect(deepEqual(42, 42).equal).toBe(true);
      expect(deepEqual('hello', 'hello').equal).toBe(true);
      expect(deepEqual(true, true).equal).toBe(true);
      expect(deepEqual(null, null).equal).toBe(true);
      expect(deepEqual(undefined, undefined).equal).toBe(true);
    });

    it('unequal primitives produce diffs', () => {
      const result = deepEqual(42, 99);
      expect(result.equal).toBe(false);
      expect(result.diffs).toHaveLength(1);
      expect(result.diffs[0]).toEqual({ path: 'root', expected: 99, actual: 42 });
    });

    it('handles NaN', () => {
      expect(deepEqual(NaN, NaN).equal).toBe(true);
    });

    it('type mismatches', () => {
      expect(deepEqual(42, '42').equal).toBe(false);
      expect(deepEqual(null, undefined).equal).toBe(false);
    });
  });

  describe('objects', () => {
    it('equal objects', () => {
      expect(deepEqual({ a: 1, b: 2 }, { a: 1, b: 2 }).equal).toBe(true);
    });

    it('missing property', () => {
      const result = deepEqual({ a: 1 }, { a: 1, b: 2 });
      expect(result.equal).toBe(false);
      expect(result.diffs.some(d => d.path === 'root.b')).toBe(true);
    });

    it('extra property', () => {
      const result = deepEqual({ a: 1, b: 2 }, { a: 1 });
      expect(result.equal).toBe(false);
      expect(result.diffs.some(d => d.path === 'root.b')).toBe(true);
    });

    it('nested property mismatch with path', () => {
      const result = deepEqual(
        { user: { address: { city: 'NYC' } } },
        { user: { address: { city: 'LA' } } },
      );
      expect(result.equal).toBe(false);
      expect(result.diffs[0].path).toBe('root.user.address.city');
      expect(result.diffs[0].expected).toBe('LA');
      expect(result.diffs[0].actual).toBe('NYC');
    });
  });

  describe('arrays', () => {
    it('equal arrays', () => {
      expect(deepEqual([1, 2, 3], [1, 2, 3]).equal).toBe(true);
    });

    it('different lengths', () => {
      const result = deepEqual([1, 2], [1, 2, 3]);
      expect(result.equal).toBe(false);
      expect(result.diffs.some(d => d.path === 'root.length')).toBe(true);
    });

    it('element mismatch with index path', () => {
      const result = deepEqual([1, 'wrong', 3], [1, 'right', 3]);
      expect(result.equal).toBe(false);
      expect(result.diffs[0].path).toBe('root[1]');
    });
  });

  describe('Dates', () => {
    it('equal dates', () => {
      const d = new Date('2024-01-15');
      expect(deepEqual(new Date(d), new Date(d)).equal).toBe(true);
    });

    it('different dates', () => {
      const result = deepEqual(new Date('2024-01-15'), new Date('2024-06-01'));
      expect(result.equal).toBe(false);
    });

    it('date vs non-date', () => {
      expect(deepEqual(new Date(), {}).equal).toBe(false);
    });
  });

  describe('Maps', () => {
    it('equal maps', () => {
      const a = new Map([['x', 1], ['y', 2]]);
      const b = new Map([['x', 1], ['y', 2]]);
      expect(deepEqual(a, b).equal).toBe(true);
    });

    it('missing key', () => {
      const a = new Map([['x', 1]]);
      const b = new Map([['x', 1], ['y', 2]]);
      expect(deepEqual(a, b).equal).toBe(false);
    });
  });

  describe('Sets', () => {
    it('equal sets', () => {
      expect(deepEqual(new Set([1, 2, 3]), new Set([1, 2, 3])).equal).toBe(true);
    });

    it('different sets', () => {
      const result = deepEqual(new Set([1, 2]), new Set([1, 3]));
      expect(result.equal).toBe(false);
    });
  });

  describe('Errors', () => {
    it('equal errors', () => {
      expect(deepEqual(new Error('boom'), new Error('boom')).equal).toBe(true);
    });

    it('different messages', () => {
      const result = deepEqual(new Error('a'), new Error('b'));
      expect(result.equal).toBe(false);
      expect(result.diffs[0].path).toBe('root.message');
    });

    it('different names', () => {
      const result = deepEqual(new TypeError('x'), new RangeError('x'));
      expect(result.equal).toBe(false);
      expect(result.diffs[0].path).toBe('root.name');
    });
  });

  describe('RegExp', () => {
    it('equal regexps', () => {
      expect(deepEqual(/abc/gi, /abc/gi).equal).toBe(true);
    });

    it('different regexps', () => {
      expect(deepEqual(/abc/, /def/).equal).toBe(false);
    });
  });

  describe('circular references', () => {
    it('does not infinite loop', () => {
      const a: Record<string, unknown> = { name: 'a' };
      a['self'] = a;
      const b: Record<string, unknown> = { name: 'a' };
      b['self'] = b;
      // Should complete without hanging
      const result = deepEqual(a, b);
      expect(result.equal).toBe(true);
    });
  });
});
