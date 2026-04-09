import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  TraceContextManager,
  EventBus,
  componentFQN,
  codeVersion,
  resetObjectIdCounter,
} from '@tautology/core';
import type { Span } from '@tautology/core';
import { wrapFunction, setMockOverride, type WrapOptions } from '../src/wrap.js';

describe('wrapFunction', () => {
  let contextManager: TraceContextManager;
  let eventBus: EventBus;
  const defaultOpts: WrapOptions = {
    componentFQN: componentFQN('test.module.myFn'),
    componentType: 'function',
    codeVersion: codeVersion('1.0.0'),
    captureInputs: true,
    captureOutputs: true,
  };

  beforeEach(() => {
    contextManager = new TraceContextManager();
    eventBus = new EventBus();
    resetObjectIdCounter();
    setMockOverride(null);
  });

  it('calls the original function and returns its result', () => {
    const fn = vi.fn((a: number, b: number) => a + b);
    const wrapped = wrapFunction(fn as (...args: unknown[]) => unknown, defaultOpts, contextManager, eventBus);

    const result = contextManager.runInNewTrace(() => wrapped(2, 3));
    expect(result).toBe(5);
    expect(fn).toHaveBeenCalledWith(2, 3);
  });

  it('emits span:start and span:end events', () => {
    const startListener = vi.fn();
    const endListener = vi.fn();
    eventBus.on('span:start', startListener);
    eventBus.on('span:end', endListener);

    const fn = () => 42;
    const wrapped = wrapFunction(fn as (...args: unknown[]) => unknown, defaultOpts, contextManager, eventBus);

    contextManager.runInNewTrace(() => wrapped());

    expect(startListener).toHaveBeenCalledOnce();
    expect(endListener).toHaveBeenCalledOnce();

    const span: Span = startListener.mock.calls[0][0];
    expect(span.componentFQN).toBe('test.module.myFn');
  });

  it('captures exceptions and re-throws', () => {
    const error = new Error('test error');
    const fn = () => { throw error; };
    const wrapped = wrapFunction(fn as (...args: unknown[]) => unknown, defaultOpts, contextManager, eventBus);

    expect(() => {
      contextManager.runInNewTrace(() => wrapped());
    }).toThrow('test error');
  });

  it('handles async functions', async () => {
    const fn = async (x: number) => {
      await new Promise(resolve => setTimeout(resolve, 10));
      return x * 2;
    };
    const wrapped = wrapFunction(fn as (...args: unknown[]) => unknown, defaultOpts, contextManager, eventBus);

    const result = await contextManager.runInNewTrace(() => wrapped(5));
    expect(result).toBe(10);
  });

  it('handles async exceptions', async () => {
    const fn = async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      throw new Error('async error');
    };
    const wrapped = wrapFunction(fn as (...args: unknown[]) => unknown, defaultOpts, contextManager, eventBus);

    await expect(
      contextManager.runInNewTrace(() => wrapped()),
    ).rejects.toThrow('async error');
  });

  it('emits events for async functions', async () => {
    const startListener = vi.fn();
    const endListener = vi.fn();
    eventBus.on('span:start', startListener);
    eventBus.on('span:end', endListener);

    const fn = async () => 'done';
    const wrapped = wrapFunction(fn as (...args: unknown[]) => unknown, defaultOpts, contextManager, eventBus);

    await contextManager.runInNewTrace(() => wrapped());

    expect(startListener).toHaveBeenCalledOnce();
    expect(endListener).toHaveBeenCalledOnce();
  });

  it('preserves function name', () => {
    function namedFunction() { return 1; }
    const wrapped = wrapFunction(namedFunction as (...args: unknown[]) => unknown, defaultOpts, contextManager, eventBus);
    expect(wrapped.name).toBe('namedFunction');
  });

  it('preserves function length', () => {
    function fn(_a: unknown, _b: unknown, _c: unknown) { return 1; }
    const wrapped = wrapFunction(fn as (...args: unknown[]) => unknown, defaultOpts, contextManager, eventBus);
    expect(wrapped.length).toBe(3);
  });

  it('uses mock override when available', () => {
    const fn = vi.fn(() => 'real');
    const wrapped = wrapFunction(fn as (...args: unknown[]) => unknown, defaultOpts, contextManager, eventBus);

    setMockOverride({
      has: (fqn) => fqn === 'test.module.myFn',
      get: () => () => 'mocked',
    });

    const result = contextManager.runInNewTrace(() => wrapped());
    expect(result).toBe('mocked');
    expect(fn).not.toHaveBeenCalled();
  });

  it('skips inputs when captureInputs is false', () => {
    const startListener = vi.fn();
    eventBus.on('span:start', startListener);

    const fn = (x: number) => x;
    const opts: WrapOptions = { ...defaultOpts, captureInputs: false };
    const wrapped = wrapFunction(fn as (...args: unknown[]) => unknown, opts, contextManager, eventBus);

    contextManager.runInNewTrace(() => wrapped(42));

    const span: Span = startListener.mock.calls[0][0];
    expect(span.inputRefs).toHaveLength(0);
  });

  it('nests child spans under parent', () => {
    const innerFn = vi.fn(() => 'inner');
    const wrappedInner = wrapFunction(
      innerFn as (...args: unknown[]) => unknown,
      { ...defaultOpts, componentFQN: componentFQN('test.module.innerFn') },
      contextManager,
      eventBus,
    );

    const outerFn = () => wrappedInner();
    const wrappedOuter = wrapFunction(
      outerFn as (...args: unknown[]) => unknown,
      defaultOpts,
      contextManager,
      eventBus,
    );

    const spans: Span[] = [];
    eventBus.on('span:start', (span) => spans.push(span));

    contextManager.runInNewTrace(() => wrappedOuter());

    expect(spans).toHaveLength(2);
    // The outer span should have been started first
    expect(spans[0].componentFQN).toBe('test.module.myFn');
    expect(spans[1].componentFQN).toBe('test.module.innerFn');
  });
});
