import { describe, it, expect, vi } from 'vitest';
import { EventBus, createTraceId, createSpanId, componentFQN, codeVersion } from '../src/index.js';
import type { Span } from '../src/index.js';

function makeSpan(overrides?: Partial<Span>): Span {
  return {
    spanId: createSpanId(),
    traceId: createTraceId(),
    parentSpanId: null,
    componentFQN: componentFQN('test.fn'),
    componentType: 'function',
    codeVersion: codeVersion('1.0'),
    startTime: 0n,
    endTime: 1n,
    threadId: null,
    asyncContextId: null,
    inputRefs: [],
    outputRef: null,
    exceptionRef: null,
    children: [],
    causalLinks: [],
    tags: {},
    status: 'ok',
    ...overrides,
  };
}

describe('EventBus', () => {
  it('emits events to registered listeners', () => {
    const bus = new EventBus();
    const listener = vi.fn();
    bus.on('span:start', listener);

    const span = makeSpan();
    bus.emit('span:start', span);

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith(span);
  });

  it('supports multiple listeners for the same event', () => {
    const bus = new EventBus();
    const l1 = vi.fn();
    const l2 = vi.fn();
    bus.on('span:start', l1);
    bus.on('span:start', l2);

    bus.emit('span:start', makeSpan());

    expect(l1).toHaveBeenCalledOnce();
    expect(l2).toHaveBeenCalledOnce();
  });

  it('removes listeners with off()', () => {
    const bus = new EventBus();
    const listener = vi.fn();
    bus.on('span:start', listener);
    bus.off('span:start', listener);

    bus.emit('span:start', makeSpan());

    expect(listener).not.toHaveBeenCalled();
  });

  it('does not throw when emitting with no listeners', () => {
    const bus = new EventBus();
    expect(() => bus.emit('span:start', makeSpan())).not.toThrow();
  });

  it('catches listener errors without affecting other listeners', () => {
    const bus = new EventBus();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const badListener = vi.fn(() => { throw new Error('boom'); });
    const goodListener = vi.fn();

    bus.on('span:start', badListener);
    bus.on('span:start', goodListener);

    bus.emit('span:start', makeSpan());

    expect(badListener).toHaveBeenCalledOnce();
    expect(goodListener).toHaveBeenCalledOnce();
    expect(errSpy).toHaveBeenCalled();

    errSpy.mockRestore();
  });

  it('removeAllListeners clears specific event', () => {
    const bus = new EventBus();
    const l1 = vi.fn();
    const l2 = vi.fn();
    bus.on('span:start', l1);
    bus.on('span:end', l2);

    bus.removeAllListeners('span:start');

    bus.emit('span:start', makeSpan());
    bus.emit('span:end', makeSpan());

    expect(l1).not.toHaveBeenCalled();
    expect(l2).toHaveBeenCalledOnce();
  });

  it('removeAllListeners() clears everything', () => {
    const bus = new EventBus();
    const l1 = vi.fn();
    const l2 = vi.fn();
    bus.on('span:start', l1);
    bus.on('span:end', l2);

    bus.removeAllListeners();

    bus.emit('span:start', makeSpan());
    bus.emit('span:end', makeSpan());

    expect(l1).not.toHaveBeenCalled();
    expect(l2).not.toHaveBeenCalled();
  });
});
