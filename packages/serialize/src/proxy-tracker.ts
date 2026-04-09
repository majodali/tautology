/**
 * Proxy-based get/set tracker for the "tracked" serialization strategy.
 *
 * Wraps an object in a transparent Proxy that records:
 * - Property access paths (get operations) → stored as accessedPaths
 * - Property mutations (set operations) → stored as MutationRecords
 *
 * Nested objects are lazily proxied when accessed, so only the used
 * subset of a large object graph gets tracked.
 *
 * The proxy is fully transparent to consuming code — typeof, instanceof,
 * and all operations pass through to the real object.
 */

import type { ObjectId, SpanId, PropertyPath, MutationRecord } from '@tautology/core';
import { createObjectId, now } from '@tautology/core';

/**
 * Accumulated tracking data for a proxied object tree.
 */
export interface TrackingData {
  /** Root object ID */
  rootObjectId: ObjectId;
  /** All property paths that were accessed (read) */
  accessedPaths: PropertyPath[];
  /** All mutations observed */
  mutations: MutationRecord[];
  /** Map from nested objects to their ObjectIds */
  nestedObjectIds: Map<object, ObjectId>;
  /** The span in which tracking is occurring */
  spanId: SpanId;
}

export function createTrackingData(rootObjectId: ObjectId, spanId: SpanId): TrackingData {
  return {
    rootObjectId,
    accessedPaths: [],
    mutations: [],
    nestedObjectIds: new Map(),
    spanId,
  };
}

// WeakMap to look up tracking data from any proxy in the tree
const proxyTrackingMap = new WeakMap<object, { tracking: TrackingData; path: PropertyPath }>();

/**
 * Returns the tracking data for a proxy, or null if it's not a tracked proxy.
 */
export function getTrackingData(proxy: object): TrackingData | null {
  const info = proxyTrackingMap.get(proxy);
  return info?.tracking ?? null;
}

/**
 * Create a tracked proxy around a target object.
 * Records all property reads and writes.
 */
export function createTrackedProxy<T extends object>(
  target: T,
  rootObjectId: ObjectId,
  spanId: SpanId,
): { proxy: T; tracking: TrackingData } {
  const tracking = createTrackingData(rootObjectId, spanId);
  const proxy = createNestedProxy(target, [], tracking);
  return { proxy, tracking };
}

function createNestedProxy<T extends object>(
  target: T,
  basePath: PropertyPath,
  tracking: TrackingData,
): T {
  // Cache of proxied nested objects to avoid creating duplicates
  const nestedProxies = new Map<string | number | symbol, object>();

  const proxy = new Proxy(target, {
    get(obj, prop, receiver) {
      // Pass through symbols and internal slots that Proxy can't intercept
      if (typeof prop === 'symbol') {
        return Reflect.get(obj, prop, receiver);
      }

      // Don't track prototype/constructor access or toJSON
      if (prop === '__proto__' || prop === 'constructor' || prop === 'toJSON') {
        return Reflect.get(obj, prop, receiver);
      }

      const value = Reflect.get(obj, prop, receiver);
      const currentPath = [...basePath, prop];

      // Record the access
      tracking.accessedPaths.push(currentPath);

      // If the value is an object, return a nested proxy (lazily created)
      if (value !== null && typeof value === 'object' && !isPrimitiveLike(value)) {
        if (nestedProxies.has(prop)) {
          return nestedProxies.get(prop);
        }

        // Assign an ObjectId to this nested object
        if (!tracking.nestedObjectIds.has(value as object)) {
          tracking.nestedObjectIds.set(value as object, createObjectId());
        }

        const nestedProxy = createNestedProxy(value as object, currentPath, tracking);
        nestedProxies.set(prop, nestedProxy);
        return nestedProxy;
      }

      return value;
    },

    set(obj, prop, newValue, receiver) {
      if (typeof prop === 'symbol') {
        return Reflect.set(obj, prop, newValue, receiver);
      }

      const currentPath = [...basePath, prop];
      const oldValue = Reflect.get(obj, prop, receiver);

      // Record the mutation
      const prevObjId = oldValue !== null && typeof oldValue === 'object'
        ? (tracking.nestedObjectIds.get(oldValue as object) ?? null)
        : null;

      const newObjId = createObjectId();

      const mutation: MutationRecord = {
        objectId: tracking.rootObjectId,
        path: currentPath,
        previousValue: prevObjId,
        newValue: newObjId,
        timestamp: now(),
        spanId: tracking.spanId,
      };
      tracking.mutations.push(mutation);

      // Invalidate cached nested proxy for this property
      nestedProxies.delete(prop);

      return Reflect.set(obj, prop, newValue, receiver);
    },

    // Pass through all other traps for transparency
    has(obj, prop) {
      return Reflect.has(obj, prop);
    },

    ownKeys(obj) {
      return Reflect.ownKeys(obj);
    },

    getOwnPropertyDescriptor(obj, prop) {
      return Reflect.getOwnPropertyDescriptor(obj, prop);
    },

    getPrototypeOf(obj) {
      return Reflect.getPrototypeOf(obj);
    },

    isExtensible(obj) {
      return Reflect.isExtensible(obj);
    },

    deleteProperty(obj, prop) {
      if (typeof prop !== 'symbol') {
        const currentPath = [...basePath, prop];
        const mutation: MutationRecord = {
          objectId: tracking.rootObjectId,
          path: currentPath,
          previousValue: null,
          newValue: createObjectId(), // represents deletion
          timestamp: now(),
          spanId: tracking.spanId,
        };
        tracking.mutations.push(mutation);
        nestedProxies.delete(prop);
      }
      return Reflect.deleteProperty(obj, prop);
    },
  });

  proxyTrackingMap.set(proxy, { tracking, path: basePath });
  return proxy;
}

/**
 * Returns true for objects that should NOT be nested-proxied
 * (either because it's unsafe or pointless).
 */
function isPrimitiveLike(value: object): boolean {
  return (
    value instanceof Date ||
    value instanceof RegExp ||
    value instanceof Error ||
    ArrayBuffer.isView(value) ||
    value instanceof ArrayBuffer ||
    value instanceof Promise
  );
}
