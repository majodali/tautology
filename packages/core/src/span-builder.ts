import type { TraceId, SpanId, ComponentFQN, CodeVersion, ObjectId } from './types/identity.js';
import { createSpanId } from './types/identity.js';
import type { ComponentType, CausalLink, Span, SpanStatus } from './types/span.js';
import type { ValueRef, SerializationStrategy } from './types/values.js';
import { now } from './clock.js';

/**
 * Fluent builder for constructing Span objects during execution.
 */
export class SpanBuilder {
  private spanId: SpanId;
  private traceId: TraceId;
  private parentSpanId: SpanId | null;
  private componentFQN: ComponentFQN;
  private componentType: ComponentType;
  private codeVersion: CodeVersion;
  private startTime: bigint;
  private endTime: bigint | null = null;
  private threadId: string | null = null;
  private asyncContextId: string | null = null;
  private inputRefs: ValueRef[] = [];
  private outputRef: ValueRef | null = null;
  private exceptionRef: ValueRef | null = null;
  private children: Span[] = [];
  private causalLinks: CausalLink[] = [];
  private tags: Record<string, string> = {};
  private status: SpanStatus = 'ok';

  constructor(opts: {
    traceId: TraceId;
    parentSpanId: SpanId | null;
    componentFQN: ComponentFQN;
    componentType: ComponentType;
    codeVersion: CodeVersion;
    spanId?: SpanId;
  }) {
    this.spanId = opts.spanId ?? createSpanId();
    this.traceId = opts.traceId;
    this.parentSpanId = opts.parentSpanId;
    this.componentFQN = opts.componentFQN;
    this.componentType = opts.componentType;
    this.codeVersion = opts.codeVersion;
    this.startTime = now();
  }

  getSpanId(): SpanId {
    return this.spanId;
  }

  getTraceId(): TraceId {
    return this.traceId;
  }

  setThreadId(id: string): this {
    this.threadId = id;
    return this;
  }

  setAsyncContextId(id: string): this {
    this.asyncContextId = id;
    return this;
  }

  addInput(
    objectId: ObjectId,
    strategy: SerializationStrategy,
    parameterIndex: number,
    parameterName?: string,
  ): this {
    this.inputRefs.push({
      objectId,
      serializationStrategy: strategy,
      parameterName: parameterName ?? null,
      parameterIndex,
    });
    return this;
  }

  setOutput(objectId: ObjectId, strategy: SerializationStrategy): this {
    this.outputRef = {
      objectId,
      serializationStrategy: strategy,
      parameterName: null,
      parameterIndex: -1,
    };
    return this;
  }

  setException(objectId: ObjectId, strategy: SerializationStrategy): this {
    this.exceptionRef = {
      objectId,
      serializationStrategy: strategy,
      parameterName: null,
      parameterIndex: -1,
    };
    this.status = 'error';
    return this;
  }

  addChild(child: Span): this {
    this.children.push(child);
    return this;
  }

  addCausalLink(link: CausalLink): this {
    this.causalLinks.push(link);
    return this;
  }

  setTag(key: string, value: string): this {
    this.tags[key] = value;
    return this;
  }

  setStatus(status: SpanStatus): this {
    this.status = status;
    return this;
  }

  /**
   * Mark the span as ended and build the immutable Span object.
   */
  end(): Span {
    this.endTime = now();
    return this.build();
  }

  /**
   * Build the Span object without ending it (for inspection).
   */
  build(): Span {
    return {
      spanId: this.spanId,
      traceId: this.traceId,
      parentSpanId: this.parentSpanId,
      componentFQN: this.componentFQN,
      componentType: this.componentType,
      codeVersion: this.codeVersion,
      startTime: this.startTime,
      endTime: this.endTime,
      threadId: this.threadId,
      asyncContextId: this.asyncContextId,
      inputRefs: [...this.inputRefs],
      outputRef: this.outputRef,
      exceptionRef: this.exceptionRef,
      children: [...this.children],
      causalLinks: [...this.causalLinks],
      tags: { ...this.tags },
      status: this.status,
    };
  }
}
