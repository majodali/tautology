/**
 * Registry of serialize/deserialize handlers for built-in and custom types.
 *
 * Each handler knows how to convert a runtime value to a JSON-serializable form
 * and back. The typeTag is stored with the SerializedValue so the correct
 * handler can be found during deserialization.
 */

export interface TypeHandler {
  /** Unique tag identifying this type, stored in SerializedValue.typeTag */
  typeTag: string;
  /** Returns true if this handler should be used for the given value */
  detect(value: unknown): boolean;
  /** Convert runtime value to JSON-serializable form */
  serialize(value: unknown): unknown;
  /** Reconstruct runtime value from serialized form */
  deserialize(data: unknown): unknown;
}

const handlers: TypeHandler[] = [];

/**
 * Register a custom type handler. Handlers are checked in registration order,
 * so register more specific handlers first.
 */
export function registerTypeHandler(handler: TypeHandler): void {
  handlers.push(handler);
}

/**
 * Find the handler for a runtime value, or null for plain objects/arrays.
 */
export function findHandler(value: unknown): TypeHandler | null {
  for (const handler of handlers) {
    if (handler.detect(value)) return handler;
  }
  return null;
}

/**
 * Find a handler by its typeTag (for deserialization).
 */
export function findHandlerByTag(typeTag: string): TypeHandler | null {
  for (const handler of handlers) {
    if (handler.typeTag === typeTag) return handler;
  }
  return null;
}

/**
 * Get the typeTag for a value without serializing it.
 */
export function getTypeTag(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';

  switch (typeof value) {
    case 'boolean': return 'boolean';
    case 'number': return 'number';
    case 'bigint': return 'bigint';
    case 'string': return 'string';
    case 'symbol': return 'symbol';
    case 'function': return 'function';
    case 'object': {
      const handler = findHandler(value);
      if (handler) return handler.typeTag;
      if (Array.isArray(value)) return 'array';
      return 'object';
    }
    default: return 'unknown';
  }
}

// --- Built-in handlers ---

registerTypeHandler({
  typeTag: 'Date',
  detect: (v) => v instanceof Date,
  serialize: (v) => (v as Date).toISOString(),
  deserialize: (d) => new Date(d as string),
});

registerTypeHandler({
  typeTag: 'RegExp',
  detect: (v) => v instanceof RegExp,
  serialize: (v) => ({ source: (v as RegExp).source, flags: (v as RegExp).flags }),
  deserialize: (d) => {
    const { source, flags } = d as { source: string; flags: string };
    return new RegExp(source, flags);
  },
});

registerTypeHandler({
  typeTag: 'Error',
  detect: (v) => v instanceof Error,
  serialize: (v) => {
    const err = v as Error;
    return {
      name: err.name,
      message: err.message,
      stack: err.stack ?? null,
      // Capture any custom properties
      ...Object.fromEntries(
        Object.getOwnPropertyNames(err)
          .filter(k => !['name', 'message', 'stack'].includes(k))
          .map(k => [k, (err as unknown as Record<string, unknown>)[k]])
      ),
    };
  },
  deserialize: (d) => {
    const data = d as { name: string; message: string; stack: string | null };
    const err = new Error(data.message);
    err.name = data.name;
    if (data.stack) err.stack = data.stack;
    return err;
  },
});

registerTypeHandler({
  typeTag: 'Map',
  detect: (v) => v instanceof Map,
  serialize: (v) => Array.from((v as Map<unknown, unknown>).entries()),
  deserialize: (d) => new Map(d as [unknown, unknown][]),
});

registerTypeHandler({
  typeTag: 'Set',
  detect: (v) => v instanceof Set,
  serialize: (v) => Array.from((v as Set<unknown>).values()),
  deserialize: (d) => new Set(d as unknown[]),
});

registerTypeHandler({
  typeTag: 'Buffer',
  detect: (v) => Buffer.isBuffer(v),
  serialize: (v) => (v as Buffer).toString('base64'),
  deserialize: (d) => Buffer.from(d as string, 'base64'),
});

registerTypeHandler({
  typeTag: 'Uint8Array',
  detect: (v) => v instanceof Uint8Array && !Buffer.isBuffer(v),
  serialize: (v) => Array.from(v as Uint8Array),
  deserialize: (d) => new Uint8Array(d as number[]),
});

registerTypeHandler({
  typeTag: 'BigInt',
  detect: (v) => typeof v === 'bigint',
  serialize: (v) => (v as bigint).toString(),
  deserialize: (d) => BigInt(d as string),
});
