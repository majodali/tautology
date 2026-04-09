/**
 * Deep serialization with circular reference detection and max depth limiting.
 *
 * Converts runtime values into JSON-serializable SerializedValue objects.
 * Uses the type handler registry for special types (Date, Map, Set, Error, etc.).
 * Tracks visited objects to detect circular references and produce ObjectId refs.
 */

import type { ObjectId, SerializedValue } from '@tautology/core';
import { createObjectId, now } from '@tautology/core';
import { findHandler, getTypeTag } from './type-handlers.js';

export interface DeepSerializeConfig {
  /** Maximum depth to traverse. Beyond this, objects become '[max depth]' */
  maxDepth: number;
}

export const DEFAULT_DEEP_SERIALIZE_CONFIG: DeepSerializeConfig = {
  maxDepth: 8,
};

/**
 * Context maintained during a serialization pass to track visited objects
 * and detect circular references.
 */
export interface SerializeContext {
  /** Maps visited objects to their ObjectIds */
  visited: Map<object, ObjectId>;
  /** Collects all SerializedValues produced during this pass */
  produced: Map<ObjectId, SerializedValue>;
}

export function createSerializeContext(): SerializeContext {
  return {
    visited: new Map(),
    produced: new Map(),
  };
}

/**
 * Deep-serialize a value, producing a SerializedValue and any nested values.
 *
 * Returns the ObjectId for the top-level value. All produced SerializedValues
 * are stored in ctx.produced.
 */
export function deepSerialize(
  value: unknown,
  config: DeepSerializeConfig,
  ctx: SerializeContext,
  objectId?: ObjectId,
): ObjectId {
  const id = objectId ?? createObjectId();
  const serialized = serializeValue(value, config, ctx, 0);

  const sv: SerializedValue = {
    objectId: id,
    typeTag: getTypeTag(value),
    data: serialized,
    accessedPaths: [],
    serializedAt: now(),
  };

  ctx.produced.set(id, sv);
  return id;
}

function serializeValue(
  value: unknown,
  config: DeepSerializeConfig,
  ctx: SerializeContext,
  depth: number,
): unknown {
  // Primitives — serialize directly
  if (value === null) return null;
  if (value === undefined) return null; // JSON doesn't have undefined
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return value;
  if (typeof value === 'bigint') return value.toString() + 'n';
  if (typeof value === 'symbol') return value.toString();
  if (typeof value === 'function') return `[Function: ${value.name || 'anonymous'}]`;

  const obj = value as object;

  // Circular reference check
  if (ctx.visited.has(obj)) {
    return { __ref: ctx.visited.get(obj)! };
  }

  // Max depth check
  if (depth >= config.maxDepth) {
    return '[max depth]';
  }

  // Register this object before recursing (for circular detection)
  const objId = createObjectId();
  ctx.visited.set(obj, objId);

  // Check for special type handler
  const handler = findHandler(value);
  if (handler) {
    return handler.serialize(value);
  }

  // Arrays
  if (Array.isArray(obj)) {
    return obj.map(item => serializeValue(item, config, ctx, depth + 1));
  }

  // Plain objects
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    try {
      result[key] = serializeValue(
        (obj as Record<string, unknown>)[key],
        config,
        ctx,
        depth + 1,
      );
    } catch {
      result[key] = '[unserializable]';
    }
  }
  return result;
}
