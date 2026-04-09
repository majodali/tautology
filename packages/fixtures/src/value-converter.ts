/**
 * Converts between SerializedValue (internal trace format) and FixtureValue
 * (portable test fixture format).
 *
 * SerializedValue carries internal metadata (objectId, accessedPaths, timestamps).
 * FixtureValue is a clean, JSON-serializable representation with just typeTag + data,
 * suitable for storing in fixture files and reconstructing at test time.
 */

import type { SerializedValue, ObjectId, SerializedValueStore, FixtureValue } from '@tautology/core';
import { findHandlerByTag } from '@tautology/serialize';

/**
 * Convert a SerializedValue to a FixtureValue (strip internal metadata).
 */
export function toFixtureValue(sv: SerializedValue): FixtureValue {
  return {
    typeTag: sv.typeTag,
    data: sv.data,
  };
}

/**
 * Convert a FixtureValue back to a runtime value.
 */
export function fromFixtureValue(fv: FixtureValue): unknown {
  // Primitives
  switch (fv.typeTag) {
    case 'null': return null;
    case 'undefined': return undefined;
    case 'boolean': return fv.data;
    case 'number': return fv.data;
    case 'string': return fv.data;
    case 'bigint': {
      const s = fv.data as string;
      // Handle both '42n' format (from deep-serialize) and plain '42' (from type handler)
      return BigInt(s.endsWith('n') ? s.slice(0, -1) : s);
    }
    case 'symbol': return Symbol(fv.data as string);
    case 'function': return undefined; // Cannot reconstruct functions
  }

  // Check type handler registry
  const handler = findHandlerByTag(fv.typeTag);
  if (handler) {
    return handler.deserialize(fv.data);
  }

  // Arrays
  if (fv.typeTag === 'array') {
    if (!Array.isArray(fv.data)) return fv.data;
    return (fv.data as unknown[]).map(item => {
      // Items may be primitives or nested objects
      if (item !== null && typeof item === 'object' && '__ref' in (item as Record<string, unknown>)) {
        return item; // Circular ref placeholder — leave as-is
      }
      return item;
    });
  }

  // Plain objects
  if (fv.typeTag === 'object') {
    return fv.data;
  }

  // Unknown type — return data as-is
  return fv.data;
}

/**
 * Look up a ValueRef's ObjectId in the value store and convert to FixtureValue.
 * Returns null if the objectId is not found.
 */
export function resolveToFixtureValue(
  objectId: ObjectId,
  store: SerializedValueStore,
): FixtureValue | null {
  const sv = store.values.get(objectId);
  if (!sv) return null;
  return toFixtureValue(sv);
}

/**
 * Look up multiple ValueRefs and convert to FixtureValues.
 */
export function resolveInputs(
  refs: { objectId: ObjectId }[],
  store: SerializedValueStore,
): FixtureValue[] {
  return refs.map(ref => {
    const fv = resolveToFixtureValue(ref.objectId, store);
    return fv ?? { typeTag: 'undefined', data: null };
  });
}
