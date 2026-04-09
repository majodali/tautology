import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import type { BoundaryConfig } from '@tautology/core';
import { DEFAULT_BOUNDARY_CONFIG } from '@tautology/core';

/**
 * Load boundary configuration from:
 * 1. .tautologyrc.json in the project root
 * 2. "tautology" key in package.json
 * 3. Falls back to defaults
 */
export function loadConfig(projectRoot?: string): BoundaryConfig {
  const root = projectRoot ?? process.cwd();

  // Try .tautologyrc.json
  try {
    const rcPath = resolve(root, '.tautologyrc.json');
    const content = readFileSync(rcPath, 'utf-8');
    const parsed = JSON.parse(content) as Partial<BoundaryConfig>;
    return mergeConfig(DEFAULT_BOUNDARY_CONFIG, parsed);
  } catch {
    // Not found or invalid — try package.json
  }

  // Try package.json "tautology" key
  try {
    const pkgPath = resolve(root, 'package.json');
    const content = readFileSync(pkgPath, 'utf-8');
    const pkg = JSON.parse(content) as Record<string, unknown>;
    if (pkg['tautology'] && typeof pkg['tautology'] === 'object') {
      return mergeConfig(DEFAULT_BOUNDARY_CONFIG, pkg['tautology'] as Partial<BoundaryConfig>);
    }
  } catch {
    // Not found or invalid
  }

  return { ...DEFAULT_BOUNDARY_CONFIG };
}

function mergeConfig(defaults: BoundaryConfig, overrides: Partial<BoundaryConfig>): BoundaryConfig {
  return {
    include: overrides.include ?? defaults.include,
    exclude: overrides.exclude ?? defaults.exclude,
    overrides: { ...defaults.overrides, ...overrides.overrides },
    serialization: { ...defaults.serialization, ...overrides.serialization },
    pathSignature: { ...defaults.pathSignature, ...overrides.pathSignature },
    storage: { ...defaults.storage, ...overrides.storage },
  };
}

/**
 * Find the project root by walking up from a starting directory looking for package.json.
 */
export function findProjectRoot(startDir?: string): string {
  let dir = startDir ?? process.cwd();
  while (true) {
    try {
      readFileSync(join(dir, 'package.json'), 'utf-8');
      return dir;
    } catch {
      const parent = resolve(dir, '..');
      if (parent === dir) return process.cwd(); // Reached filesystem root
      dir = parent;
    }
  }
}
