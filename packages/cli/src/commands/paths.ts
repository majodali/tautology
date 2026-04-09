/**
 * tautology paths — list known execution path signatures.
 */

import { join } from 'node:path';
import { SignatureStore } from '@tautology/collector';
import { loadConfig, findProjectRoot } from '@tautology/instrument';
import { formatPathsList } from '../formatter.js';

export function pathsCommand(): void {
  const root = findProjectRoot();
  const config = loadConfig(root);
  const sigPath = join(root, config.storage.outputDir, 'signatures.json');

  const store = new SignatureStore(sigPath);
  store.load();

  const sigs = store.getAll().map(sig => ({ signature: sig }));
  console.log(formatPathsList(sigs));
}
