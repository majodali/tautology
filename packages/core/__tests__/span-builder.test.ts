import { describe, it, expect } from 'vitest';
import {
  SpanBuilder,
  createTraceId,
  createSpanId,
  createObjectId,
  componentFQN,
  codeVersion,
} from '../src/index.js';

describe('SpanBuilder', () => {
  const defaultOpts = {
    traceId: createTraceId(),
    parentSpanId: null,
    componentFQN: componentFQN('test.module.myFunction'),
    componentType: 'function' as const,
    codeVersion: codeVersion('1.0.0'),
  };

  it('creates a span with correct identity fields', () => {
    const builder = new SpanBuilder(defaultOpts);
    const span = builder.end();

    expect(span.traceId).toBe(defaultOpts.traceId);
    expect(span.parentSpanId).toBeNull();
    expect(span.componentFQN).toBe('test.module.myFunction');
    expect(span.componentType).toBe('function');
    expect(span.codeVersion).toBe('1.0.0');
    expect(span.spanId).toBeTruthy();
  });

  it('records timing', () => {
    const builder = new SpanBuilder(defaultOpts);
    const span = builder.end();

    expect(span.startTime).toBeTypeOf('bigint');
    expect(span.endTime).toBeTypeOf('bigint');
    expect(span.endTime!).toBeGreaterThanOrEqual(span.startTime);
  });

  it('defaults to ok status', () => {
    const builder = new SpanBuilder(defaultOpts);
    expect(builder.end().status).toBe('ok');
  });

  it('captures inputs', () => {
    const builder = new SpanBuilder(defaultOpts);
    const objId = createObjectId();
    builder.addInput(objId, 'full', 0, 'userId');
    const span = builder.end();

    expect(span.inputRefs).toHaveLength(1);
    expect(span.inputRefs[0]).toEqual({
      objectId: objId,
      serializationStrategy: 'full',
      parameterName: 'userId',
      parameterIndex: 0,
    });
  });

  it('captures output', () => {
    const builder = new SpanBuilder(defaultOpts);
    const objId = createObjectId();
    builder.setOutput(objId, 'tracked');
    const span = builder.end();

    expect(span.outputRef).not.toBeNull();
    expect(span.outputRef!.objectId).toBe(objId);
    expect(span.outputRef!.serializationStrategy).toBe('tracked');
  });

  it('captures exceptions and sets error status', () => {
    const builder = new SpanBuilder(defaultOpts);
    const objId = createObjectId();
    builder.setException(objId, 'full');
    const span = builder.end();

    expect(span.exceptionRef).not.toBeNull();
    expect(span.status).toBe('error');
  });

  it('supports parent span ID', () => {
    const parentId = createSpanId();
    const builder = new SpanBuilder({ ...defaultOpts, parentSpanId: parentId });
    const span = builder.end();
    expect(span.parentSpanId).toBe(parentId);
  });

  it('adds children', () => {
    const childBuilder = new SpanBuilder({
      ...defaultOpts,
      componentFQN: componentFQN('test.module.childFn'),
    });
    const childSpan = childBuilder.end();

    const parentBuilder = new SpanBuilder(defaultOpts);
    parentBuilder.addChild(childSpan);
    const parentSpan = parentBuilder.end();

    expect(parentSpan.children).toHaveLength(1);
    expect(parentSpan.children[0].componentFQN).toBe('test.module.childFn');
  });

  it('adds causal links', () => {
    const builder = new SpanBuilder(defaultOpts);
    builder.addCausalLink({
      sourceSpanId: createSpanId(),
      sourceTraceId: createTraceId(),
      relationship: 'triggered_by',
    });
    const span = builder.end();
    expect(span.causalLinks).toHaveLength(1);
    expect(span.causalLinks[0].relationship).toBe('triggered_by');
  });

  it('sets tags', () => {
    const builder = new SpanBuilder(defaultOpts);
    builder.setTag('http.method', 'GET').setTag('http.status', '200');
    const span = builder.end();
    expect(span.tags).toEqual({ 'http.method': 'GET', 'http.status': '200' });
  });

  it('build() returns span without ending it', () => {
    const builder = new SpanBuilder(defaultOpts);
    const snapshot = builder.build();
    expect(snapshot.endTime).toBeNull();

    const ended = builder.end();
    expect(ended.endTime).not.toBeNull();
  });

  it('returns defensive copies of arrays', () => {
    const builder = new SpanBuilder(defaultOpts);
    const objId = createObjectId();
    builder.addInput(objId, 'full', 0);

    const span1 = builder.build();
    const span2 = builder.build();

    // Should be equal but not the same reference
    expect(span1.inputRefs).toEqual(span2.inputRefs);
    expect(span1.inputRefs).not.toBe(span2.inputRefs);
  });
});
