/**
 * ESM loader hooks for Node.js module.register() API.
 *
 * The `load` hook intercepts module loading for matched modules and appends
 * instrumentation code that wraps exported functions.
 *
 * These hooks run in the loader thread, separate from the main thread.
 * Configuration is received via the `data` parameter of module.register().
 */

import type { BoundaryConfig } from '@tautology/core';
import { createBoundaryMatcher, type BoundaryMatcher } from '../match.js';

interface LoadHookContext {
  conditions: string[];
  format?: string;
  importAttributes: Record<string, string>;
}

interface LoadHookResult {
  format: string;
  shortCircuit?: boolean;
  source: string | ArrayBuffer | SharedArrayBuffer;
}

type NextLoad = (url: string, context: LoadHookContext) => Promise<LoadHookResult>;

let matcher: BoundaryMatcher | null = null;

/**
 * Called once when the hooks are registered — receives config from the main thread.
 */
export function initialize(data: { config: BoundaryConfig }): void {
  matcher = createBoundaryMatcher(data.config);
}

/**
 * The load hook — intercepts module source for matched modules.
 * For matched modules, it wraps the original source in instrumentation.
 */
export async function load(
  url: string,
  context: LoadHookContext,
  nextLoad: NextLoad,
): Promise<LoadHookResult> {
  const result = await nextLoad(url, context);

  // Only process JavaScript/TypeScript modules
  if (result.format !== 'module' && result.format !== 'commonjs') {
    return result;
  }

  // Convert file URL to a module identifier for matching
  const fqn = urlToModuleFQN(url);
  if (!fqn || !matcher?.matches(fqn)) {
    return result;
  }

  // Get the original source as string
  const source = typeof result.source === 'string'
    ? result.source
    : new TextDecoder().decode(result.source);

  // Append wrapping code that instruments exported functions
  // This approach re-exports everything but wraps function exports
  const wrappedSource = `${source}

// --- Tautology instrumentation ---
import { __tautologyWrapExports as __tw } from '@tautology/instrument';
__tw(import.meta.url, ${JSON.stringify(fqn)});
`;

  return {
    ...result,
    source: wrappedSource,
  };
}

/**
 * Converts a file:// URL to a dot-separated FQN.
 * e.g., file:///project/src/services/user-service.ts → src.services.user-service
 */
function urlToModuleFQN(url: string): string | null {
  if (!url.startsWith('file://')) return null;

  try {
    const filePath = new URL(url).pathname;
    // Remove leading slash on Windows paths and file extension
    const normalized = filePath
      .replace(/^\/([A-Z]:)/, '$1')  // Windows drive letter
      .replace(/\.(ts|js|mts|mjs|cts|cjs)$/, '')
      .replace(/\/index$/, '');  // Remove /index suffix

    // Find the last occurrence of node_modules or src and use that as base
    const parts = normalized.split('/');
    const srcIndex = parts.lastIndexOf('src');
    const relevant = srcIndex >= 0 ? parts.slice(srcIndex) : parts.slice(-3);

    return relevant.join('.');
  } catch {
    return null;
  }
}
