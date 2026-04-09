import { describe, it, expect, beforeEach } from 'vitest';
import {
  createTraceId,
  createSpanId,
  createObjectId,
  resetObjectIdCounter,
  componentFQN,
  codeVersion,
  pathSignature,
} from '../src/index.js';

describe('Identity types', () => {
  describe('createTraceId', () => {
    it('produces unique UUIDs', () => {
      const a = createTraceId();
      const b = createTraceId();
      expect(a).not.toBe(b);
      expect(a).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  describe('createSpanId', () => {
    it('produces unique UUIDs', () => {
      const a = createSpanId();
      const b = createSpanId();
      expect(a).not.toBe(b);
    });
  });

  describe('createObjectId', () => {
    beforeEach(() => resetObjectIdCounter());

    it('produces sequential IDs', () => {
      expect(createObjectId()).toBe('obj_1');
      expect(createObjectId()).toBe('obj_2');
      expect(createObjectId()).toBe('obj_3');
    });

    it('resets counter', () => {
      createObjectId();
      createObjectId();
      resetObjectIdCounter();
      expect(createObjectId()).toBe('obj_1');
    });
  });

  describe('branded constructors', () => {
    it('componentFQN wraps string', () => {
      const fqn = componentFQN('src.services.user-service');
      expect(fqn).toBe('src.services.user-service');
    });

    it('codeVersion wraps string', () => {
      const v = codeVersion('1.2.3');
      expect(v).toBe('1.2.3');
    });

    it('pathSignature wraps string', () => {
      const sig = pathSignature('abc123');
      expect(sig).toBe('abc123');
    });
  });
});
