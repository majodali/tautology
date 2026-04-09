/**
 * Fast heuristic size estimation for deciding between full vs tracked serialization.
 *
 * This does NOT deeply traverse — it's meant to be O(1) or O(keys) at most.
 * The goal is a rough byte estimate, not precision. When in doubt, overestimate
 * to push large objects toward the tracked (Proxy) strategy.
 */

const POINTER_SIZE = 64; // bytes estimate per reference/pointer
const STRING_OVERHEAD = 32;

export function estimateSize(value: unknown): number {
  if (value === null || value === undefined) return 8;

  switch (typeof value) {
    case 'boolean':
      return 8;
    case 'number':
      return 8;
    case 'bigint':
      return 16;
    case 'string':
      return STRING_OVERHEAD + (value as string).length * 2; // UTF-16
    case 'symbol':
      return 64;
    case 'function':
      return 128;
    case 'object':
      return estimateObjectSize(value as object);
    default:
      return POINTER_SIZE;
  }
}

function estimateObjectSize(obj: object): number {
  // Special types with known-ish sizes
  if (obj instanceof Date) return 64;
  if (obj instanceof RegExp) return 128;
  if (obj instanceof Error) {
    return 256 + ((obj as Error).stack?.length ?? 0) * 2;
  }

  if (ArrayBuffer.isView(obj)) {
    return 64 + (obj as { byteLength: number }).byteLength;
  }
  if (obj instanceof ArrayBuffer || obj instanceof SharedArrayBuffer) {
    return 64 + obj.byteLength;
  }

  if (obj instanceof Map) {
    return 128 + obj.size * POINTER_SIZE * 2; // key + value pointers
  }
  if (obj instanceof Set) {
    return 128 + obj.size * POINTER_SIZE;
  }

  if (Array.isArray(obj)) {
    // Estimate: header + one pointer per element
    return 64 + obj.length * POINTER_SIZE;
  }

  // Plain object: header + keys
  const keys = Object.keys(obj);
  let size = 64; // object header
  for (const key of keys) {
    size += STRING_OVERHEAD + key.length * 2; // key string
    size += POINTER_SIZE; // value pointer
  }
  return size;
}
