import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  TraceContextManager,
  EventBus,
  componentFQN,
  codeVersion,
  createValueStore,
  resetObjectIdCounter,
} from '@tautology/core';
import type { Span } from '@tautology/core';
import { wrapFunction, setGlobalSerializer, type WrapOptions } from '@tautology/instrument';
import { ProxySerializer } from '../src/serializer.js';

describe('instrument + serialize integration', () => {
  let contextManager: TraceContextManager;
  let eventBus: EventBus;
  let serializer: ProxySerializer;

  const defaultOpts: WrapOptions = {
    componentFQN: componentFQN('test.service.getUser'),
    componentType: 'function',
    codeVersion: codeVersion('1.0.0'),
    captureInputs: true,
    captureOutputs: true,
  };

  beforeEach(() => {
    resetObjectIdCounter();
    contextManager = new TraceContextManager();
    eventBus = new EventBus();
    const store = createValueStore();
    serializer = new ProxySerializer({}, store);
    setGlobalSerializer(serializer);
  });

  it('captures serialized inputs and outputs in the value store', () => {
    const fn = (userId: string) => ({ id: userId, name: 'Alice', email: 'alice@test.com' });
    const wrapped = wrapFunction(fn as (...args: unknown[]) => unknown, defaultOpts, contextManager, eventBus);

    const spans: Span[] = [];
    eventBus.on('span:start', (s) => spans.push(s));

    const result = contextManager.runInNewTrace(() => wrapped('user-123'));

    expect(result).toEqual({ id: 'user-123', name: 'Alice', email: 'alice@test.com' });

    // The value store should contain the serialized input and output
    const store = serializer.getStore();
    expect(store.values.size).toBeGreaterThanOrEqual(2); // at least input + output

    // Check that we can find the input value
    const values = [...store.values.values()];
    const stringValues = values.filter(v => v.typeTag === 'string');
    expect(stringValues.length).toBeGreaterThanOrEqual(1);
    expect(stringValues.some(v => v.data === 'user-123')).toBe(true);

    // Check that we can find the output value
    const objectValues = values.filter(v => v.typeTag === 'object');
    expect(objectValues.length).toBeGreaterThanOrEqual(1);
    expect(objectValues.some(v => {
      const data = v.data as Record<string, unknown>;
      return data['id'] === 'user-123' && data['name'] === 'Alice';
    })).toBe(true);
  });

  it('captures serialized exceptions', () => {
    const fn = () => { throw new Error('not found'); };
    const wrapped = wrapFunction(fn as (...args: unknown[]) => unknown, defaultOpts, contextManager, eventBus);

    expect(() => contextManager.runInNewTrace(() => wrapped())).toThrow('not found');

    const store = serializer.getStore();
    const errorValues = [...store.values.values()].filter(v => v.typeTag === 'Error');
    expect(errorValues.length).toBeGreaterThanOrEqual(1);
    expect(errorValues.some(v => {
      const data = v.data as { message: string };
      return data.message === 'not found';
    })).toBe(true);
  });

  it('captures async function inputs and outputs', async () => {
    const fn = async (x: number) => {
      await new Promise(resolve => setTimeout(resolve, 5));
      return x * 2;
    };
    const wrapped = wrapFunction(fn as (...args: unknown[]) => unknown, defaultOpts, contextManager, eventBus);

    const result = await contextManager.runInNewTrace(() => wrapped(21));
    expect(result).toBe(42);

    const store = serializer.getStore();
    const numberValues = [...store.values.values()].filter(v => v.typeTag === 'number');
    expect(numberValues.some(v => v.data === 21)).toBe(true);
    expect(numberValues.some(v => v.data === 42)).toBe(true);
  });

  it('uses identity tracking — same object gets same ObjectId', () => {
    const sharedConfig = { timeout: 5000, retries: 3 };

    const fn1 = (cfg: unknown) => ({ used: cfg });
    const fn2 = (cfg: unknown) => ({ also_used: cfg });

    const wrapped1 = wrapFunction(
      fn1 as (...args: unknown[]) => unknown,
      { ...defaultOpts, componentFQN: componentFQN('test.fn1') },
      contextManager,
      eventBus,
    );
    const wrapped2 = wrapFunction(
      fn2 as (...args: unknown[]) => unknown,
      { ...defaultOpts, componentFQN: componentFQN('test.fn2') },
      contextManager,
      eventBus,
    );

    contextManager.runInNewTrace(() => {
      wrapped1(sharedConfig);
      wrapped2(sharedConfig);
    });

    // The shared config object should appear as 'full' once, then 'reference' the second time
    // We can't easily verify this through the store alone, but the store should not
    // have two separate serialized values for the same object
    const store = serializer.getStore();
    const configValues = [...store.values.values()].filter(v => {
      if (v.typeTag !== 'object') return false;
      const data = v.data as Record<string, unknown>;
      return data['timeout'] === 5000 && data['retries'] === 3;
    });
    // Should only appear once (second time is a reference, not a new entry)
    expect(configValues).toHaveLength(1);
  });

  // Clean up global serializer
  afterEach(() => {
    setGlobalSerializer(null);
  });
});
