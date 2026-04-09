/**
 * Type-aware deep equality comparison with structured diffs.
 *
 * Produces a list of specific property-path mismatches rather than
 * just a boolean, so the reporter can show exactly what went wrong.
 */

export interface ComparisonDiff {
  path: string;
  expected: unknown;
  actual: unknown;
}

export interface ComparisonResult {
  equal: boolean;
  diffs: ComparisonDiff[];
}

const MAX_DIFFS = 20;

export function deepEqual(actual: unknown, expected: unknown, path = 'root'): ComparisonResult {
  const diffs: ComparisonDiff[] = [];
  compare(actual, expected, path, diffs, new Set());
  return { equal: diffs.length === 0, diffs };
}

function compare(
  actual: unknown,
  expected: unknown,
  path: string,
  diffs: ComparisonDiff[],
  visited: Set<object>,
): void {
  if (diffs.length >= MAX_DIFFS) return;

  // Identical values (including NaN === NaN via Object.is)
  if (Object.is(actual, expected)) return;

  // Both null or undefined
  if (actual == null || expected == null) {
    if (actual !== expected) {
      diffs.push({ path, expected, actual });
    }
    return;
  }

  // Different types
  if (typeof actual !== typeof expected) {
    diffs.push({ path, expected, actual });
    return;
  }

  // Primitives
  if (typeof actual !== 'object') {
    if (actual !== expected) {
      diffs.push({ path, expected, actual });
    }
    return;
  }

  // Both are objects from here
  const actualObj = actual as object;
  const expectedObj = expected as object;

  // Circular reference guard
  if (visited.has(actualObj) || visited.has(expectedObj)) {
    return; // Assume equal for circular refs to avoid infinite recursion
  }
  visited.add(actualObj);
  visited.add(expectedObj);

  // Date comparison
  if (actualObj instanceof Date && expectedObj instanceof Date) {
    if (actualObj.getTime() !== expectedObj.getTime()) {
      diffs.push({ path, expected: expectedObj.toISOString(), actual: actualObj.toISOString() });
    }
    return;
  }
  if (actualObj instanceof Date || expectedObj instanceof Date) {
    diffs.push({ path, expected, actual });
    return;
  }

  // RegExp comparison
  if (actualObj instanceof RegExp && expectedObj instanceof RegExp) {
    if (actualObj.source !== expectedObj.source || actualObj.flags !== expectedObj.flags) {
      diffs.push({ path, expected: expectedObj.toString(), actual: actualObj.toString() });
    }
    return;
  }

  // Error comparison
  if (actualObj instanceof Error && expectedObj instanceof Error) {
    if (actualObj.name !== expectedObj.name) {
      diffs.push({ path: `${path}.name`, expected: expectedObj.name, actual: actualObj.name });
    }
    if (actualObj.message !== expectedObj.message) {
      diffs.push({ path: `${path}.message`, expected: expectedObj.message, actual: actualObj.message });
    }
    return;
  }

  // Map comparison
  if (actualObj instanceof Map && expectedObj instanceof Map) {
    compareMaps(actualObj, expectedObj, path, diffs, visited);
    return;
  }
  if (actualObj instanceof Map || expectedObj instanceof Map) {
    diffs.push({ path, expected: `Map(${(expectedObj as Map<unknown, unknown>).size ?? '?'})`, actual: `${typeof actual}` });
    return;
  }

  // Set comparison
  if (actualObj instanceof Set && expectedObj instanceof Set) {
    compareSets(actualObj, expectedObj, path, diffs);
    return;
  }
  if (actualObj instanceof Set || expectedObj instanceof Set) {
    diffs.push({ path, expected: `Set(${(expectedObj as Set<unknown>).size ?? '?'})`, actual: `${typeof actual}` });
    return;
  }

  // Array comparison
  if (Array.isArray(actualObj) && Array.isArray(expectedObj)) {
    if (actualObj.length !== expectedObj.length) {
      diffs.push({ path: `${path}.length`, expected: expectedObj.length, actual: actualObj.length });
    }
    const maxLen = Math.max(actualObj.length, expectedObj.length);
    for (let i = 0; i < maxLen && diffs.length < MAX_DIFFS; i++) {
      compare(actualObj[i], expectedObj[i], `${path}[${i}]`, diffs, visited);
    }
    return;
  }
  if (Array.isArray(actualObj) || Array.isArray(expectedObj)) {
    diffs.push({ path, expected, actual });
    return;
  }

  // Plain object comparison
  const actualRecord = actualObj as Record<string, unknown>;
  const expectedRecord = expectedObj as Record<string, unknown>;
  const allKeys = new Set([...Object.keys(actualRecord), ...Object.keys(expectedRecord)]);

  for (const key of allKeys) {
    if (diffs.length >= MAX_DIFFS) break;
    const childPath = `${path}.${key}`;

    if (!(key in actualRecord)) {
      diffs.push({ path: childPath, expected: expectedRecord[key], actual: undefined });
    } else if (!(key in expectedRecord)) {
      diffs.push({ path: childPath, expected: undefined, actual: actualRecord[key] });
    } else {
      compare(actualRecord[key], expectedRecord[key], childPath, diffs, visited);
    }
  }
}

function compareMaps(
  actual: Map<unknown, unknown>,
  expected: Map<unknown, unknown>,
  path: string,
  diffs: ComparisonDiff[],
  visited: Set<object>,
): void {
  // Check for missing/extra keys
  for (const key of expected.keys()) {
    if (!actual.has(key)) {
      diffs.push({ path: `${path}.get(${String(key)})`, expected: expected.get(key), actual: undefined });
    }
  }
  for (const key of actual.keys()) {
    if (!expected.has(key)) {
      diffs.push({ path: `${path}.get(${String(key)})`, expected: undefined, actual: actual.get(key) });
    }
  }
  // Compare shared keys
  for (const key of expected.keys()) {
    if (actual.has(key) && diffs.length < MAX_DIFFS) {
      compare(actual.get(key), expected.get(key), `${path}.get(${String(key)})`, diffs, visited);
    }
  }
}

function compareSets(
  actual: Set<unknown>,
  expected: Set<unknown>,
  path: string,
  diffs: ComparisonDiff[],
): void {
  const missing = [...expected].filter(v => !actual.has(v));
  const extra = [...actual].filter(v => !expected.has(v));

  if (missing.length > 0) {
    diffs.push({ path: `${path} (missing)`, expected: missing, actual: undefined });
  }
  if (extra.length > 0) {
    diffs.push({ path: `${path} (extra)`, expected: undefined, actual: extra });
  }
}
