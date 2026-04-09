import {
  type ComponentFQN,
  type CodeVersion,
  type ComponentType,
  type Span,
  type SpanId,
  SpanBuilder,
  TraceContextManager,
  EventBus,
  createSpanId,
  createTraceId,
} from '@tautology/core';
import { ProxySerializer, type SerializeResult } from '@tautology/serialize';

export interface WrapOptions {
  componentFQN: ComponentFQN;
  componentType: ComponentType;
  codeVersion: CodeVersion;
  captureInputs: boolean;
  captureOutputs: boolean;
}

/**
 * Global mock registry hook — when set, checked before calling the real function.
 * This allows the test runner (Phase 5) to inject mocks without modifying wrap logic.
 */
export interface MockOverride {
  has(fqn: ComponentFQN): boolean;
  get(fqn: ComponentFQN): ((...args: unknown[]) => unknown) | undefined;
}

let mockOverride: MockOverride | null = null;

export function setMockOverride(override: MockOverride | null): void {
  mockOverride = override;
}

/**
 * Global serializer instance — set by the register entry point.
 * When null, falls back to a per-call instance (useful for testing).
 */
let globalSerializer: ProxySerializer | null = null;

export function setGlobalSerializer(serializer: ProxySerializer | null): void {
  globalSerializer = serializer;
}

export function getGlobalSerializer(): ProxySerializer | null {
  return globalSerializer;
}

/**
 * Wraps a function with tracing instrumentation.
 * Creates spans on each call, captures inputs/outputs via ProxySerializer,
 * propagates context across async boundaries.
 */
export function wrapFunction<T extends (...args: unknown[]) => unknown>(
  fn: T,
  options: WrapOptions,
  contextManager: TraceContextManager,
  eventBus: EventBus,
): T {
  const wrapped = function wrappedFunction(this: unknown, ...args: unknown[]): unknown {
    // Check for mock override (used by test runner)
    if (mockOverride?.has(options.componentFQN)) {
      const mock = mockOverride.get(options.componentFQN);
      if (mock) return mock(...args);
    }

    const parentCtx = contextManager.getCurrentContext();
    const serializer = globalSerializer ?? new ProxySerializer();
    // Use a stable spanId for serialization context before the builder creates one
    const spanId = createSpanId();
    // If no trace context exists, this is a root span — start a new trace
    const traceId = parentCtx?.traceId ?? createTraceId();
    const parentSpanId = parentCtx?.spanId ?? null;

    // Create the span builder
    const builder = new SpanBuilder({
      traceId,
      parentSpanId,
      componentFQN: options.componentFQN,
      componentType: options.componentType,
      codeVersion: options.codeVersion,
      spanId,
    });

    // Capture inputs via serializer
    if (options.captureInputs) {
      for (let i = 0; i < args.length; i++) {
        const result = captureValue(serializer, args[i], spanId);
        builder.addInput(result.objectId, result.strategy, i);
      }
    }

    // Emit span start
    const startSpan = builder.build();
    eventBus.emit('span:start', startSpan);

    // Execute the real function in a child context
    try {
      const result = contextManager.runInChildContext(() => {
        return fn.apply(this, args);
      }, builder);

      // Check if result is a promise (async function)
      if (result != null && typeof (result as { then?: unknown }).then === 'function') {
        return (result as Promise<unknown>).then(
          (value) => {
            if (options.captureOutputs) {
              const sr = captureValue(serializer, value, spanId);
              builder.setOutput(sr.objectId, sr.strategy);
            }
            const span = builder.end();
            attachToParent(span, parentCtx);
            eventBus.emit('span:end', span);
            return value;
          },
          (error: unknown) => {
            const sr = captureValue(serializer, error, spanId);
            builder.setException(sr.objectId, sr.strategy);
            const span = builder.end();
            attachToParent(span, parentCtx);
            eventBus.emit('span:end', span);
            throw error;
          },
        );
      }

      // Synchronous return
      if (options.captureOutputs) {
        const sr = captureValue(serializer, result, spanId);
        builder.setOutput(sr.objectId, sr.strategy);
      }
      const span = builder.end();
      attachToParent(span, parentCtx);
      eventBus.emit('span:end', span);
      return result;
    } catch (error: unknown) {
      const sr = captureValue(serializer, error, spanId);
      builder.setException(sr.objectId, sr.strategy);
      const span = builder.end();
      attachToParent(span, parentCtx);
      eventBus.emit('span:end', span);
      throw error;
    }
  } as unknown as T;

  // Preserve function name and length for transparency
  Object.defineProperty(wrapped, 'name', { value: fn.name, configurable: true });
  Object.defineProperty(wrapped, 'length', { value: fn.length, configurable: true });

  return wrapped;
}

/**
 * Serialize a value using the ProxySerializer.
 * Returns the ObjectId and strategy used.
 */
function captureValue(serializer: ProxySerializer, value: unknown, spanId: SpanId): SerializeResult {
  try {
    return serializer.serialize(value, spanId);
  } catch {
    // If serialization fails, create a placeholder
    return serializer.serialize('[capture error]', spanId);
  }
}

/**
 * Attach a completed child span to its parent's builder if the parent is in context.
 */
function attachToParent(
  span: Span,
  parentCtx: ReturnType<TraceContextManager['getCurrentContext']>,
): void {
  if (parentCtx?.spanBuilder) {
    parentCtx.spanBuilder.addChild(span);
  }
}
