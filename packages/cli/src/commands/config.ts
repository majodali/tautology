/**
 * tautology config <subcommand> — manage configuration.
 *
 * Subcommands:
 *   init — write default .tautologyrc.json
 *   show — print active configuration
 */

import { writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_BOUNDARY_CONFIG } from '@tautology/core';
import { loadConfig, findProjectRoot } from '@tautology/instrument';
import { formatConfigInfo } from '../formatter.js';

export function configInitCommand(): void {
  const root = findProjectRoot();
  const rcPath = join(root, '.tautologyrc.json');

  if (existsSync(rcPath)) {
    console.log(`Configuration already exists: ${rcPath}`);
    console.log('Edit the file directly or delete it to regenerate defaults.');
    return;
  }

  writeFileSync(rcPath, JSON.stringify(DEFAULT_BOUNDARY_CONFIG, null, 2), 'utf-8');
  console.log(`Created default configuration: ${rcPath}`);
}

export function configShowCommand(): void {
  const root = findProjectRoot();
  const config = loadConfig(root);
  console.log(formatConfigInfo(config as unknown as Record<string, unknown>));
}
