/**
 * tautology run [fixture-glob] — run fixtures and report results.
 */

import { join } from 'node:path';
import { FixtureStore } from '@tautology/fixtures';
import { FixtureRunner, formatResult, formatSummary } from '@tautology/runner';
import { loadConfig, findProjectRoot } from '@tautology/instrument';

export async function runCommand(glob?: string): Promise<void> {
  const root = findProjectRoot();
  const config = loadConfig(root);
  const fixturesDir = join(root, '.tautology/fixtures');
  const store = new FixtureStore(fixturesDir);

  let fixtures = store.loadAll();
  if (fixtures.length === 0) {
    console.log('No fixtures found. Run `tautology fixtures generate` first.');
    return;
  }

  // Filter by glob/partial ID if provided
  if (glob) {
    fixtures = fixtures.filter(f =>
      f.fixtureId.includes(glob) ||
      f.name.includes(glob) ||
      f.entryPoint.componentFQN.includes(glob)
    );
    if (fixtures.length === 0) {
      console.log(`No fixtures matching "${glob}".`);
      return;
    }
  }

  console.log(`Running ${fixtures.length} fixture(s)...\n`);

  const runner = new FixtureRunner({
    moduleMap: (config as unknown as Record<string, unknown>)['moduleMap'] as Record<string, string> ?? {},
    timeout: 5000,
    verifyMockInputs: true,
  });

  const results = await runner.runAll(fixtures);

  for (const result of results) {
    console.log(formatResult(result));
  }

  console.log(formatSummary(results));

  const failures = results.filter(r => r.status !== 'pass');
  if (failures.length > 0) {
    process.exitCode = 1;
  }
}
