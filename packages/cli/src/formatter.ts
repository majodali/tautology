/**
 * Display utilities for CLI output — tables, trees, and colored text.
 */

import type { Trace, Span, PathSignature } from '@tautology/core';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

export function formatTraceTree(trace: Trace): string {
  const lines: string[] = [];
  const status = trace.status === 'error' ? `${RED}ERROR${RESET}` : `${GREEN}OK${RESET}`;
  lines.push(`${BOLD}Trace${RESET} ${trace.traceId} [${status}]`);
  if (trace.pathSignature) {
    lines.push(`  ${DIM}Path:${RESET} ${trace.pathSignature}`);
  }
  if (trace.retentionReason) {
    lines.push(`  ${DIM}Retained:${RESET} ${trace.retentionReason}`);
  }
  lines.push('');
  formatSpanTree(trace.rootSpan, lines, '', true);
  return lines.join('\n');
}

function formatSpanTree(span: Span, lines: string[], prefix: string, isLast: boolean): void {
  const connector = isLast ? '└─ ' : '├─ ';
  const statusIcon = span.status === 'error' ? `${RED}✗${RESET}` : `${GREEN}✓${RESET}`;

  let duration = '';
  if (span.endTime !== null) {
    const ms = Number(span.endTime - span.startTime) / 1_000_000;
    duration = ` ${DIM}(${ms.toFixed(2)}ms)${RESET}`;
  }

  lines.push(`${prefix}${connector}${statusIcon} ${CYAN}${span.componentFQN}${RESET}${duration}`);

  const childPrefix = prefix + (isLast ? '   ' : '│  ');
  for (let i = 0; i < span.children.length; i++) {
    formatSpanTree(span.children[i], lines, childPrefix, i === span.children.length - 1);
  }
}

export function formatPathsList(signatures: { signature: PathSignature; count?: number }[]): string {
  if (signatures.length === 0) return `${DIM}No known execution paths.${RESET}`;

  const lines: string[] = [];
  lines.push(`${BOLD}Known Execution Paths${RESET} (${signatures.length})`);
  lines.push('');
  for (const entry of signatures) {
    const count = entry.count !== undefined ? ` ${DIM}(seen ${entry.count}x)${RESET}` : '';
    lines.push(`  ${YELLOW}${entry.signature}${RESET}${count}`);
  }
  return lines.join('\n');
}

export function formatFixtureInfo(fixture: {
  fixtureId: string;
  name: string;
  entryPoint: { componentFQN: string };
  inputs: { typeTag: string }[];
  mockedDependencies: { componentFQN: string }[];
}): string {
  const lines: string[] = [];
  lines.push(`${BOLD}${fixture.name}${RESET}`);
  lines.push(`  ${DIM}ID:${RESET}    ${fixture.fixtureId}`);
  lines.push(`  ${DIM}Entry:${RESET} ${CYAN}${fixture.entryPoint.componentFQN}${RESET}`);
  lines.push(`  ${DIM}Inputs:${RESET} ${fixture.inputs.length} (${fixture.inputs.map(i => i.typeTag).join(', ')})`);
  if (fixture.mockedDependencies.length > 0) {
    const deps = [...new Set(fixture.mockedDependencies.map(m => m.componentFQN))];
    lines.push(`  ${DIM}Mocks:${RESET}  ${deps.join(', ')}`);
  }
  return lines.join('\n');
}

export function formatConfigInfo(config: Record<string, unknown>): string {
  return JSON.stringify(config, null, 2);
}
