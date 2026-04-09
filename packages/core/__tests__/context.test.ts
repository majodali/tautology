import { describe, it, expect } from 'vitest';
import { TraceContextManager } from '../src/index.js';

describe('TraceContextManager', () => {
  it('returns null when no context is active', () => {
    const mgr = new TraceContextManager();
    expect(mgr.getCurrentContext()).toBeNull();
  });

  it('provides context within runInNewTrace', () => {
    const mgr = new TraceContextManager();
    mgr.runInNewTrace(() => {
      const ctx = mgr.getCurrentContext();
      expect(ctx).not.toBeNull();
      expect(ctx!.traceId).toBeTruthy();
      expect(ctx!.spanId).toBeTruthy();
      expect(ctx!.parentSpanId).toBeNull();
    });
  });

  it('provides child context within runInChildContext', () => {
    const mgr = new TraceContextManager();
    mgr.runInNewTrace(() => {
      const parentCtx = mgr.getCurrentContext()!;

      mgr.runInChildContext(() => {
        const childCtx = mgr.getCurrentContext()!;
        expect(childCtx.traceId).toBe(parentCtx.traceId);
        expect(childCtx.spanId).not.toBe(parentCtx.spanId);
        expect(childCtx.parentSpanId).toBe(parentCtx.spanId);
      });
    });
  });

  it('restores parent context after child exits', () => {
    const mgr = new TraceContextManager();
    mgr.runInNewTrace(() => {
      const parentCtx = mgr.getCurrentContext()!;

      mgr.runInChildContext(() => {
        // Inside child
      });

      const restored = mgr.getCurrentContext()!;
      expect(restored.spanId).toBe(parentCtx.spanId);
    });
  });

  it('propagates context across async boundaries', async () => {
    const mgr = new TraceContextManager();
    const result = await mgr.runInNewTrace(async () => {
      const before = mgr.getCurrentContext()!;

      await new Promise(resolve => setTimeout(resolve, 10));

      const after = mgr.getCurrentContext()!;
      expect(after.traceId).toBe(before.traceId);
      expect(after.spanId).toBe(before.spanId);
      return 'done';
    });
    expect(result).toBe('done');
  });

  it('supports nested async child contexts', async () => {
    const mgr = new TraceContextManager();
    await mgr.runInNewTrace(async () => {
      const parentCtx = mgr.getCurrentContext()!;

      await mgr.runInChildContext(async () => {
        const childCtx = mgr.getCurrentContext()!;
        expect(childCtx.traceId).toBe(parentCtx.traceId);
        expect(childCtx.parentSpanId).toBe(parentCtx.spanId);

        await new Promise(resolve => setTimeout(resolve, 10));

        // Context should persist after await
        const afterAwait = mgr.getCurrentContext()!;
        expect(afterAwait.spanId).toBe(childCtx.spanId);
      });

      // Parent context should be restored
      const restored = mgr.getCurrentContext()!;
      expect(restored.spanId).toBe(parentCtx.spanId);
    });
  });
});
