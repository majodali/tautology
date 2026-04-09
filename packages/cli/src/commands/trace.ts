/**
 * tautology trace <script> — runs a script with instrumentation and captures traces.
 */

import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

export async function traceCommand(scriptPath: string, args: string[]): Promise<void> {
  const resolvedScript = resolve(scriptPath);

  console.log(`[tautology] Tracing: ${resolvedScript}`);
  console.log(`[tautology] Args: ${args.join(' ') || '(none)'}`);

  const child = spawn(
    process.execPath,
    [
      '--import', '@tautology/instrument/register',
      resolvedScript,
      ...args,
    ],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_OPTIONS: '',
      },
    },
  );

  return new Promise((resolvePromise, reject) => {
    child.on('close', (code) => {
      if (code === 0) {
        console.log(`\n[tautology] Trace complete. Check .tautology/traces/ for results.`);
        resolvePromise();
      } else {
        reject(new Error(`Script exited with code ${code}`));
      }
    });
    child.on('error', reject);
  });
}
