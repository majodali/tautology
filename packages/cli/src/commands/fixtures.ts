/**
 * tautology fixtures <subcommand> — manage test fixtures.
 *
 * Subcommands:
 *   generate  — generate fixtures from retained traces
 *   list      — list all stored fixtures
 *   show <id> — display a fixture's details
 */

import { join } from 'node:path';
import { TraceStorage } from '@tautology/collector';
import { FixtureGenerator, FixtureStore } from '@tautology/fixtures';
import { loadConfig, findProjectRoot } from '@tautology/instrument';
import { formatFixtureInfo } from '../formatter.js';

export async function fixturesGenerateCommand(): Promise<void> {
  const root = findProjectRoot();
  const config = loadConfig(root);
  const tracesDir = join(root, config.storage.outputDir);
  const fixturesDir = join(root, '.tautology/fixtures');

  const traceStorage = new TraceStorage(tracesDir);
  const fixtureStore = new FixtureStore(fixturesDir);

  const traceIds = traceStorage.list();
  if (traceIds.length === 0) {
    console.log('No retained traces found. Run `tautology trace <script>` first.');
    return;
  }

  console.log(`Found ${traceIds.length} retained trace(s).`);

  const generator = new FixtureGenerator({
    dependencyPatterns: config.include, // Use include patterns as dependency hints
  });

  let generated = 0;
  for (const traceId of traceIds) {
    const trace = traceStorage.load(traceId);
    if (!trace) continue;

    const fixtures = generator.generate(trace);
    for (const fixture of fixtures) {
      fixtureStore.save(fixture);
      generated++;
      console.log(`  Generated: ${fixture.name} (${fixture.fixtureId.slice(0, 8)}...)`);
    }
  }

  console.log(`\n${generated} fixture(s) generated in ${fixturesDir}`);
}

export function fixturesListCommand(): void {
  const root = findProjectRoot();
  const fixturesDir = join(root, '.tautology/fixtures');
  const store = new FixtureStore(fixturesDir);

  const fixtures = store.loadAll();
  if (fixtures.length === 0) {
    console.log('No fixtures found. Run `tautology fixtures generate` first.');
    return;
  }

  console.log(`${fixtures.length} fixture(s):\n`);
  for (const fixture of fixtures) {
    console.log(formatFixtureInfo(fixture));
    console.log('');
  }
}

export function fixturesShowCommand(fixtureId: string): void {
  const root = findProjectRoot();
  const fixturesDir = join(root, '.tautology/fixtures');
  const store = new FixtureStore(fixturesDir);

  const fixture = store.load(fixtureId);
  if (!fixture) {
    // Try partial match
    const all = store.loadAll();
    const match = all.find(f => f.fixtureId.startsWith(fixtureId));
    if (match) {
      console.log(JSON.stringify(match, null, 2));
      return;
    }
    console.error(`Fixture not found: ${fixtureId}`);
    process.exitCode = 1;
    return;
  }

  console.log(JSON.stringify(fixture, null, 2));
}
