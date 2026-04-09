// Identity types and factories
export type {
  TraceId,
  SpanId,
  ComponentFQN,
  CodeVersion,
  PathSignature,
  ObjectId,
} from './types/identity.js';
export {
  createTraceId,
  createSpanId,
  createObjectId,
  resetObjectIdCounter,
  componentFQN,
  codeVersion,
  pathSignature,
} from './types/identity.js';

// Span types
export type {
  ComponentType,
  SpanStatus,
  CausalLink,
  Span,
} from './types/span.js';

// Value types
export type {
  SerializationStrategy,
  ValueRef,
  PropertyPath,
  SerializedValue,
  MutationRecord,
  SerializedValueStore,
} from './types/values.js';
export { createValueStore } from './types/values.js';

// Trace types
export type {
  TraceStatus,
  RetentionReason,
  Trace,
} from './types/trace.js';

// Config types
export type {
  ComponentConfig,
  SerializationConfig,
  PathSignatureConfig,
  StorageConfig,
  BoundaryConfig,
} from './types/config.js';
export {
  DEFAULT_COMPONENT_CONFIG,
  DEFAULT_SERIALIZATION_CONFIG,
  DEFAULT_PATH_SIGNATURE_CONFIG,
  DEFAULT_STORAGE_CONFIG,
  DEFAULT_BOUNDARY_CONFIG,
} from './types/config.js';

// Path types
export type { PathNode } from './types/path.js';

// Fixture types
export type {
  FixtureValue,
  MockedCall,
  SideEffectExpectation,
  TestFixture,
} from './types/fixture.js';

// Propagation
export type { TraceContext, TracePropagator } from './types/propagation.js';
export {
  serializeTraceContext,
  deserializeTraceContext,
  defaultPropagator,
  TRACE_HEADERS,
} from './types/propagation.js';

// Clock
export { now, elapsedMs, elapsedUs, formatDuration } from './clock.js';

// SpanBuilder
export { SpanBuilder } from './span-builder.js';

// Context
export type { SpanContext } from './context.js';
export { TraceContextManager } from './context.js';

// Event Bus
export type { TracingEvents } from './event-bus.js';
export { EventBus } from './event-bus.js';
