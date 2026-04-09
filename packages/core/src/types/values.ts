import type { ObjectId, SpanId } from './identity.js';

export type SerializationStrategy = 'full' | 'tracked' | 'reference';

/**
 * A reference from a span to a serialized value in the trace's value store.
 */
export interface ValueRef {
  objectId: ObjectId;
  serializationStrategy: SerializationStrategy;
  /** Named parameter, if known */
  parameterName: string | null;
  /** Positional index in the argument list */
  parameterIndex: number;
}

/**
 * A path of property accesses into an object, e.g. ['user', 'address', 'city'].
 */
export type PropertyPath = (string | number)[];

/**
 * A serialized representation of a runtime value.
 */
export interface SerializedValue {
  objectId: ObjectId;
  /** Type discriminator for deserialization: 'object', 'array', 'Map', 'Set', 'Date', 'Error', etc. */
  typeTag: string;
  /** JSON-serializable representation of the value */
  data: unknown;
  /** Property paths accessed via proxy tracking (for 'tracked' strategy) */
  accessedPaths: PropertyPath[];
  /** When this value was serialized */
  serializedAt: bigint;
}

/**
 * Records a mutation observed via proxy tracking.
 */
export interface MutationRecord {
  objectId: ObjectId;
  path: PropertyPath;
  previousValue: ObjectId | null;
  newValue: ObjectId;
  timestamp: bigint;
  spanId: SpanId;
}

/**
 * The value store for a trace — contains all serialized values and observed mutations.
 */
export interface SerializedValueStore {
  values: Map<ObjectId, SerializedValue>;
  mutations: MutationRecord[];
}

export function createValueStore(): SerializedValueStore {
  return {
    values: new Map(),
    mutations: [],
  };
}
