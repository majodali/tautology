/**
 * Demo scenarios — exercises multiple execution paths through the user service.
 *
 * These scenarios demonstrate Tautology's trace capture and fixture generation:
 * 1. Successful user lookup
 * 2. User not found (error path)
 * 3. Create new user (with email side effect)
 * 4. Create duplicate user (error)
 * 5. Update user (with conditional email notification)
 */

import {
  TraceContextManager,
  EventBus,
  componentFQN,
  codeVersion,
  createValueStore,
} from '@tautology/core';
import { ProxySerializer } from '@tautology/serialize';
import { wrapFunction, setGlobalSerializer } from '@tautology/instrument';
import { TraceAssembler, SignatureStore, TraceStorage } from '@tautology/collector';
import { FixtureGenerator, FixtureStore } from '@tautology/fixtures';
import { FixtureRunner, formatResult, formatSummary } from '@tautology/runner';
import type { Trace, RetentionReason } from '@tautology/core';

import { seedUsers, findById, save, deleteUser } from './repositories/user-repository.js';
import { sendWelcomeEmail, sendNotification } from './services/email-service.js';
import { getUser, createUser, updateUser } from './services/user-service.js';

// --- Setup Tautology infrastructure ---

const contextManager = new TraceContextManager();
const eventBus = new EventBus();
const store = createValueStore();
const serializer = new ProxySerializer({}, store);
setGlobalSerializer(serializer);

const signatureStore = new SignatureStore();
const assembler = new TraceAssembler(eventBus, signatureStore, { valueStore: store });
const traceStorage = new TraceStorage('.tautology/traces', 100);

const completedTraces: { trace: Trace; reason: RetentionReason | null }[] = [];
assembler.onTraceComplete = (trace, reason) => {
  completedTraces.push({ trace, reason });
  if (reason) {
    traceStorage.store(trace);
  }
};

// --- Wrap functions at component boundaries ---

const opts = (fqn: string) => ({
  componentFQN: componentFQN(fqn),
  componentType: 'function' as const,
  codeVersion: codeVersion('1.0.0'),
  captureInputs: true,
  captureOutputs: true,
});

const wrappedFindById = wrapFunction(findById as (...args: unknown[]) => unknown, opts('repo.findById'), contextManager, eventBus);
const wrappedSave = wrapFunction(save as (...args: unknown[]) => unknown, opts('repo.save'), contextManager, eventBus);
const wrappedDeleteUser = wrapFunction(deleteUser as (...args: unknown[]) => unknown, opts('repo.deleteUser'), contextManager, eventBus);
const wrappedSendWelcome = wrapFunction(sendWelcomeEmail as (...args: unknown[]) => unknown, opts('email.sendWelcome'), contextManager, eventBus);
const wrappedSendNotification = wrapFunction(sendNotification as (...args: unknown[]) => unknown, opts('email.sendNotification'), contextManager, eventBus);

// Wrap service functions — these call the wrapped dependencies above
const wrappedGetUser = wrapFunction(getUser as (...args: unknown[]) => unknown, opts('svc.getUser'), contextManager, eventBus);
const wrappedCreateUser = wrapFunction(createUser as (...args: unknown[]) => unknown, opts('svc.createUser'), contextManager, eventBus);
const wrappedUpdateUser = wrapFunction(updateUser as (...args: unknown[]) => unknown, opts('svc.updateUser'), contextManager, eventBus);

// --- Run Scenarios ---

console.log('=== Tautology Demo ===\n');

// Seed the repository
seedUsers();

// Scenario 1: Successful user lookup
console.log('--- Scenario 1: Get existing user ---');
try {
  const user = wrappedGetUser('user-1');
  console.log('  Result:', user);
} catch (err) {
  console.error('  Error:', (err as Error).message);
}

// Scenario 2: User not found
console.log('\n--- Scenario 2: Get non-existent user ---');
try {
  wrappedGetUser('user-999');
} catch (err) {
  console.log('  Expected error:', (err as Error).message);
}

// Scenario 3: Create new user
console.log('\n--- Scenario 3: Create new user ---');
try {
  const user = wrappedCreateUser('user-3', 'Charlie', 'charlie@example.com');
  console.log('  Created:', user);
} catch (err) {
  console.error('  Error:', (err as Error).message);
}

// Scenario 4: Duplicate user
console.log('\n--- Scenario 4: Create duplicate user ---');
try {
  wrappedCreateUser('user-1', 'Alice Again', 'alice2@example.com');
} catch (err) {
  console.log('  Expected error:', (err as Error).message);
}

// Scenario 5: Update user with email change
console.log('\n--- Scenario 5: Update user email ---');
try {
  const user = wrappedUpdateUser('user-2', { email: 'bob.new@example.com' });
  console.log('  Updated:', user);
} catch (err) {
  console.error('  Error:', (err as Error).message);
}

// --- Results ---

console.log('\n=== Trace Results ===');
console.log(`Total traces: ${completedTraces.length}`);
console.log(`Retained: ${completedTraces.filter(t => t.reason !== null).length}`);
console.log(`Discarded: ${completedTraces.filter(t => t.reason === null).length}`);
console.log(`Unique paths: ${signatureStore.size}`);

for (const { trace, reason } of completedTraces) {
  const status = trace.status === 'error' ? 'ERROR' : 'OK';
  const retained = reason ? `retained (${reason})` : 'discarded';
  console.log(`  [${status}] ${trace.rootSpan.componentFQN} — ${retained}`);
}

// --- Generate fixtures ---

console.log('\n=== Fixture Generation ===');
const generator = new FixtureGenerator({
  dependencyPatterns: ['repo.**', 'email.**'],
});

const fixtureStore = new FixtureStore('.tautology/fixtures');
let fixtureCount = 0;

for (const { trace, reason } of completedTraces) {
  if (!reason) continue; // Only generate from retained traces
  const fixtures = generator.generate(trace);
  for (const fixture of fixtures) {
    fixtureStore.save(fixture);
    fixtureCount++;
    console.log(`  Generated: ${fixture.name}`);
  }
}
console.log(`${fixtureCount} fixture(s) generated.`);

// --- Run fixtures ---

console.log('\n=== Fixture Execution ===');
const allFixtures = fixtureStore.loadAll();
const runner = new FixtureRunner({ verifyMockInputs: false });

const results = [];
for (const fixture of allFixtures) {
  // Determine which wrapped function to use based on entry point
  let fn: ((...args: unknown[]) => unknown) | null = null;
  const fqn = fixture.entryPoint.componentFQN;
  if (fqn === 'svc.getUser') fn = wrappedGetUser;
  else if (fqn === 'svc.createUser') fn = wrappedCreateUser;
  else if (fqn === 'svc.updateUser') fn = wrappedUpdateUser;

  if (fn) {
    // Re-seed before each fixture run to ensure clean state
    seedUsers();
    const result = await runner.runWithFunction(fixture, fn);
    results.push(result);
    console.log(formatResult(result));
  }
}

console.log(formatSummary(results));

// Flush
traceStorage.flush();
signatureStore.save();

console.log('\n=== Demo Complete ===');
