/**
 * ProxySerializer — the main entry point for the serialization engine.
 *
 * Orchestrates the three serialization strategies:
 * - 'full': Value is below size threshold → deep-serialize immediately
 * - 'tracked': Value is above threshold → wrap in a tracking Proxy, defer serialization
 * - 'reference': Value already seen in this trace → return existing ObjectId
 *
 * The serializer maintains identity tracking via WeakMap so the same runtime
 * object always maps to the same ObjectId within a trace.
 */

import type {
  ObjectId,
  SpanId,
  SerializationStrategy,
  SerializedValue,
  SerializedValueStore,
} from '@tautology/core';
import { createObjectId, createValueStore, now } from '@tautology/core';
import { estimateSize } from './size-estimator.js';
import {
  deepSerialize,
  createSerializeContext,
  type DeepSerializeConfig,
} from './deep-serialize.js';
import { createTrackedProxy } from './proxy-tracker.js';
import { getTypeTag } from './type-handlers.js';

export interface SerializerConfig {
  /** Byte threshold: values estimated below this are fully serialized */
  sizeThreshold: number;
  /** Max depth for deep serialization */
  maxDepth: number;
  /** Types that are always fully serialized regardless of size */
  alwaysFullTypes: string[];
  /** Types that are never serialized */
  neverSerializeTypes: string[];
}

export const DEFAULT_SERIALIZER_CONFIG: SerializerConfig = {
  sizeThreshold: 16384, // 16KB
  maxDepth: 8,
  alwaysFullTypes: [],
  neverSerializeTypes: [],
};

export interface SerializeResult {
  objectId: ObjectId;
  strategy: SerializationStrategy;
  /** For 'tracked' strategy: the proxied value to pass to consuming code */
  proxiedValue?: unknown;
}

export class ProxySerializer {
  private config: SerializerConfig;
  /** Identity tracking: same runtime object → same ObjectId */
  private identityMap = new WeakMap<object, ObjectId>();
  /** The trace's value store — all serialized values end up here */
  private store: SerializedValueStore;

  constructor(config?: Partial<SerializerConfig>, store?: SerializedValueStore) {
    this.config = { ...DEFAULT_SERIALIZER_CONFIG, ...config };
    this.store = store ?? createValueStore();
  }

  getStore(): SerializedValueStore {
    return this.store;
  }

  /**
   * Serialize a value using the appropriate strategy.
   *
   * @param value - The runtime value to serialize
   * @param spanId - The span this value belongs to (for mutation tracking)
   * @returns ObjectId and strategy used, plus proxied value if tracked
   */
  serialize(value: unknown, spanId: SpanId): SerializeResult {
    // Primitives are always fully serialized inline
    if (value === null || value === undefined || typeof value !== 'object') {
      return this.serializeFull(value);
    }

    const obj = value as object;

    // Check if we've already seen this exact object
    const existingId = this.identityMap.get(obj);
    if (existingId) {
      return { objectId: existingId, strategy: 'reference' };
    }

    const typeTag = getTypeTag(value);

    // Never-serialize types
    if (this.config.neverSerializeTypes.includes(typeTag)) {
      const id = createObjectId();
      this.identityMap.set(obj, id);
      const sv: SerializedValue = {
        objectId: id,
        typeTag,
        data: `[${typeTag}: not serialized]`,
        accessedPaths: [],
        serializedAt: now(),
      };
      this.store.values.set(id, sv);
      return { objectId: id, strategy: 'full' };
    }

    // Always-full types
    if (this.config.alwaysFullTypes.includes(typeTag)) {
      return this.serializeFull(value);
    }

    // Size-based decision
    const estimated = estimateSize(value);
    if (estimated <= this.config.sizeThreshold) {
      return this.serializeFull(value);
    }

    // Large object → tracked proxy
    return this.serializeTracked(obj, spanId);
  }

  /**
   * Full deep serialization of a value.
   */
  private serializeFull(value: unknown): SerializeResult {
    const id = createObjectId();

    if (value !== null && value !== undefined && typeof value === 'object') {
      this.identityMap.set(value as object, id);
    }

    const ctx = createSerializeContext();
    const deepConfig: DeepSerializeConfig = { maxDepth: this.config.maxDepth };
    deepSerialize(value, deepConfig, ctx, id);

    // Move all produced values into the store
    for (const [objId, sv] of ctx.produced) {
      this.store.values.set(objId, sv);
    }

    return { objectId: id, strategy: 'full' };
  }

  /**
   * Tracked proxy serialization for large objects.
   * Returns a proxy that records access/mutations.
   * The actual serialization of accessed data happens later (on flush).
   */
  private serializeTracked(obj: object, spanId: SpanId): SerializeResult {
    const id = createObjectId();
    this.identityMap.set(obj, id);

    const { proxy, tracking } = createTrackedProxy(obj, id, spanId);

    // Create a placeholder SerializedValue — the actual data is filled in on flush
    const sv: SerializedValue = {
      objectId: id,
      typeTag: getTypeTag(obj),
      data: null, // populated on flush
      accessedPaths: tracking.accessedPaths, // live reference, grows as proxy is used
      serializedAt: now(),
    };
    this.store.values.set(id, sv);

    return { objectId: id, strategy: 'tracked', proxiedValue: proxy };
  }

  /**
   * Flush all tracked proxies — serialize the accessed subsets of tracked objects.
   * Call this when a trace is complete to finalize all deferred serialization.
   */
  flushTracked(): void {
    for (const [, sv] of this.store.values) {
      if (sv.data === null && sv.accessedPaths.length > 0) {
        // This was a tracked value — serialize the accessed subset
        // For now, we store the accessed paths as the data
        // A more sophisticated approach would reconstruct only the accessed subtree
        sv.data = {
          __tracked: true,
          accessedPaths: sv.accessedPaths,
        };
        sv.serializedAt = now();
      }
    }
  }

  /**
   * Collect all mutation records from tracked proxies into the store.
   */
  collectMutations(): void {
    // Mutations are added to tracking data as they occur.
    // Walk all values and collect from any that have tracking data.
    for (const [, sv] of this.store.values) {
      if (sv.data === null) {
        // This is a tracked proxy placeholder — check for mutations
        // Mutations are already recorded in the TrackingData and will be
        // collected during flush
      }
    }
  }

  /**
   * Reset the serializer state for a new trace.
   */
  reset(): void {
    this.identityMap = new WeakMap();
    this.store = createValueStore();
  }
}
