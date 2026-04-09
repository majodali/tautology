#!/usr/bin/env node

/**
 * Tautology CLI — execution tracing and test fixture management.
 *
 * Commands:
 *   trace <script>       Run a script with tracing enabled
 *   fixtures generate    Generate fixtures from retained traces
 *   fixtures list        List all stored fixtures
 *   fixtures show <id>   Display a fixture's details
 *   run [glob]           Run fixtures and report results
 *   config init          Write default .tautologyrc.json
 *   config show          Print active configuration
 *   paths                List known execution path signatures
 */

import { parseArgs } from 'node:util';
import { traceCommand } from './commands/trace.js';
import { fixturesGenerateCommand, fixturesListCommand, fixturesShowCommand } from './commands/fixtures.js';
import { runCommand } from './commands/run.js';
import { configInitCommand, configShowCommand } from './commands/config.js';
import { pathsCommand } from './commands/paths.js';

const HELP = `
Usage: tautology <command> [options]

Commands:
  trace <script>       Run a script with tracing enabled
  fixtures generate    Generate fixtures from retained traces
  fixtures list        List all stored fixtures
  fixtures show <id>   Display a fixture's details
  run [glob]           Run fixtures and report results
  config init          Write default .tautologyrc.json
  config show          Print active configuration
  paths                List known execution path signatures
  help                 Show this help message
`;

async function main(): Promise<void> {
  const { positionals } = parseArgs({
    allowPositionals: true,
    strict: false,
  });

  const command = positionals[0];

  switch (command) {
    case 'trace': {
      const script = positionals[1];
      if (!script) {
        console.error('Usage: tautology trace <script> [args...]');
        process.exitCode = 1;
        return;
      }
      await traceCommand(script, positionals.slice(2));
      break;
    }

    case 'fixtures': {
      const sub = positionals[1];
      switch (sub) {
        case 'generate':
          await fixturesGenerateCommand();
          break;
        case 'list':
          fixturesListCommand();
          break;
        case 'show': {
          const id = positionals[2];
          if (!id) {
            console.error('Usage: tautology fixtures show <fixture-id>');
            process.exitCode = 1;
            return;
          }
          fixturesShowCommand(id);
          break;
        }
        default:
          console.error(`Unknown fixtures subcommand: ${sub}`);
          console.log('Available: generate, list, show <id>');
          process.exitCode = 1;
      }
      break;
    }

    case 'run':
      await runCommand(positionals[1]);
      break;

    case 'config': {
      const sub = positionals[1];
      switch (sub) {
        case 'init':
          configInitCommand();
          break;
        case 'show':
          configShowCommand();
          break;
        default:
          console.error(`Unknown config subcommand: ${sub}`);
          console.log('Available: init, show');
          process.exitCode = 1;
      }
      break;
    }

    case 'paths':
      pathsCommand();
      break;

    case 'help':
    case '--help':
    case '-h':
    case undefined:
      console.log(HELP);
      break;

    default:
      console.error(`Unknown command: ${command}`);
      console.log(HELP);
      process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
