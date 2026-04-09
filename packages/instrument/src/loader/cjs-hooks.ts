/**
 * CJS instrumentation by monkey-patching Module._load.
 * Wraps function-valued exports of matched modules.
 */

import Module from 'node:module';
import type { BoundaryConfig, CodeVersion, TraceContextManager, EventBus } from '@tautology/core';
import { componentFQN } from '@tautology/core';
import { createBoundaryMatcher, type BoundaryMatcher } from '../match.js';
import { wrapFunction, type WrapOptions } from '../wrap.js';

interface CjsHooksState {
  matcher: BoundaryMatcher;
  contextManager: TraceContextManager;
  eventBus: EventBus;
  defaultCodeVersion: CodeVersion;
}

let state: CjsHooksState | null = null;

// Store original _load
const originalLoad = (Module as unknown as { _load: (...args: unknown[]) => unknown })._load;

export function installCjsHooks(
  config: BoundaryConfig,
  contextManager: TraceContextManager,
  eventBus: EventBus,
  version: CodeVersion,
): void {
  state = {
    matcher: createBoundaryMatcher(config),
    contextManager,
    eventBus,
    defaultCodeVersion: version,
  };

  (Module as unknown as { _load: (...args: unknown[]) => unknown })._load = function patchedLoad(
    request: unknown,
    parent: unknown,
    isMain: unknown,
  ): unknown {
    const result = (originalLoad as Function).call(this, request, parent, isMain);

    if (!state || typeof request !== 'string') return result;

    const fqn = requestToFQN(request);
    if (!fqn || !state.matcher.matches(fqn)) return result;

    // Wrap function-valued exports
    if (typeof result === 'object' && result !== null) {
      for (const key of Object.keys(result as Record<string, unknown>)) {
        const value = (result as Record<string, unknown>)[key];
        if (typeof value === 'function') {
          const opts: WrapOptions = {
            componentFQN: componentFQN(`${fqn}.${key}`),
            componentType: 'function',
            codeVersion: state.defaultCodeVersion,
            captureInputs: true,
            captureOutputs: true,
          };
          (result as Record<string, unknown>)[key] = wrapFunction(
            value as (...args: unknown[]) => unknown,
            opts,
            state.contextManager,
            state.eventBus,
          );
        }
      }
    }

    return result;
  };
}

export function removeCjsHooks(): void {
  (Module as unknown as { _load: (...args: unknown[]) => unknown })._load = originalLoad as (...args: unknown[]) => unknown;
  state = null;
}

function requestToFQN(request: string): string | null {
  // Skip node built-ins and node_modules
  if (request.startsWith('node:') || (!request.startsWith('.') && !request.startsWith('/'))) {
    return null;
  }

  const normalized = request
    .replace(/\.(ts|js|mts|mjs|cts|cjs)$/, '')
    .replace(/\/index$/, '');

  const parts = normalized.split('/').filter(Boolean);
  const srcIndex = parts.lastIndexOf('src');
  const relevant = srcIndex >= 0 ? parts.slice(srcIndex) : parts.slice(-3);

  return relevant.join('.');
}
