/**
 * Entry point resolution — maps a fixture's ComponentFQN to a callable function.
 *
 * Uses a moduleMap config to translate FQN prefixes to filesystem paths,
 * then dynamically imports the module and extracts the named export.
 */

import type { TestFixture } from '@tautology/core';
import type { RunnerConfig } from './runner.js';

/**
 * Resolve a fixture's entry point to a callable function.
 *
 * @param fixture - The fixture whose entry point to resolve
 * @param config - Runner config containing moduleMap
 * @returns The resolved function
 */
export async function resolveEntryPoint(
  fixture: TestFixture,
  config: RunnerConfig,
): Promise<(...args: unknown[]) => unknown> {
  const fqn = fixture.entryPoint.componentFQN as string;
  const segments = fqn.split('.');

  if (segments.length < 2) {
    throw new Error(
      `Cannot resolve FQN "${fqn}": expected at least two segments (module.export)`,
    );
  }

  // The last segment is the export name
  const exportName = segments[segments.length - 1];

  // Try moduleMap first: find the longest matching prefix
  let modulePath: string | null = null;

  const prefixes = Object.keys(config.moduleMap).sort((a, b) => b.length - a.length);
  for (const prefix of prefixes) {
    if (fqn.startsWith(prefix)) {
      const basePath = config.moduleMap[prefix];
      // Remaining segments between prefix and export name form the sub-path
      const prefixSegments = prefix.split('.');
      const midSegments = segments.slice(prefixSegments.length, -1);
      if (midSegments.length > 0) {
        modulePath = `${basePath}/${midSegments.join('/')}`;
      } else {
        // If prefix covers everything except the export name, use base path
        // e.g., prefix "svc" maps "svc.getUser" → basePath module, export "getUser"
        modulePath = basePath;
      }
      break;
    }
  }

  // Fallback: convention-based resolution
  if (!modulePath) {
    // e.g., "svc.users.getUser" → "./svc/users" with export "getUser"
    const pathSegments = segments.slice(0, -1);
    modulePath = `./${pathSegments.join('/')}`;
  }

  // Dynamic import
  let mod: Record<string, unknown>;
  try {
    mod = await import(modulePath) as Record<string, unknown>;
  } catch (err) {
    throw new Error(
      `Failed to import module "${modulePath}" for FQN "${fqn}": ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Extract the named export
  const fn = mod[exportName];
  if (typeof fn !== 'function') {
    const available = Object.keys(mod).filter(k => typeof mod[k] === 'function');
    throw new Error(
      `Export "${exportName}" not found or not a function in module "${modulePath}". ` +
      `Available functions: ${available.join(', ') || '(none)'}`,
    );
  }

  return fn as (...args: unknown[]) => unknown;
}
