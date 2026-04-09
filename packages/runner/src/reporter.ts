/**
 * Human-readable result formatting with ANSI colors.
 */

import type { FixtureResult } from './runner.js';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

export function formatResult(result: FixtureResult): string {
  const lines: string[] = [];
  const icon = result.status === 'pass' ? `${GREEN}✓${RESET}`
    : result.status === 'fail' ? `${RED}✗${RESET}`
    : `${YELLOW}!${RESET}`;

  const duration = `${DIM}(${result.duration.toFixed(1)}ms)${RESET}`;
  lines.push(`${icon} ${result.name} ${duration}`);

  if (result.status === 'error' && result.runnerError) {
    lines.push(`  ${RED}Runner error: ${result.runnerError.message}${RESET}`);
  }

  if (result.outputDiff && result.outputDiff.length > 0) {
    lines.push(`  ${RED}Output mismatch:${RESET}`);
    for (const diff of result.outputDiff) {
      lines.push(`    ${DIM}at${RESET} ${diff.path}:`);
      lines.push(`      ${GREEN}expected:${RESET} ${formatValue(diff.expected)}`);
      lines.push(`      ${RED}  actual:${RESET} ${formatValue(diff.actual)}`);
    }
  }

  if (result.mockMismatches.length > 0) {
    lines.push(`  ${RED}Mock mismatches:${RESET}`);
    for (const mm of result.mockMismatches) {
      lines.push(`    ${mm.type}: ${mm.componentFQN} call #${mm.callIndex}`);
      if (mm.details) {
        lines.push(`      ${DIM}${mm.details}${RESET}`);
      }
    }
  }

  return lines.join('\n');
}

export function formatSummary(results: FixtureResult[]): string {
  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;
  const errors = results.filter(r => r.status === 'error').length;
  const total = results.length;
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

  const lines: string[] = [''];

  if (failed === 0 && errors === 0) {
    lines.push(`${BOLD}${GREEN}All ${total} fixtures passed${RESET} ${DIM}(${totalDuration.toFixed(0)}ms)${RESET}`);
  } else {
    const parts: string[] = [];
    if (passed > 0) parts.push(`${GREEN}${passed} passed${RESET}`);
    if (failed > 0) parts.push(`${RED}${failed} failed${RESET}`);
    if (errors > 0) parts.push(`${YELLOW}${errors} errors${RESET}`);
    lines.push(`${BOLD}Fixtures:${RESET} ${parts.join(', ')} ${DIM}(${total} total, ${totalDuration.toFixed(0)}ms)${RESET}`);
  }

  return lines.join('\n');
}

function formatValue(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'string') return `"${value}"`;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
