/**
 * Entry point for --import @tautology/instrument/register
 *
 * Initializes the full tracing infrastructure:
 * 1. Loads boundary configuration
 * 2. Creates shared TraceContextManager, EventBus, and ProxySerializer
 * 3. Creates TraceAssembler, SignatureStore, and TraceStorage
 * 4. Installs CJS hooks (monkey-patches Module._load)
 * 5. Registers ESM hooks via module.register()
 *
 * Usage:
 *   node --import @tautology/instrument/register your-app.js
 */

import { register } from 'node:module';
import { join } from 'node:path';
import { TraceContextManager, EventBus, codeVersion } from '@tautology/core';
import { ProxySerializer } from '@tautology/serialize';
import { TraceAssembler, SignatureStore, TraceStorage } from '@tautology/collector';
import { loadConfig, findProjectRoot } from '../config-loader.js';
import { installCjsHooks } from './cjs-hooks.js';
import { setGlobalSerializer } from '../wrap.js';

// --- Global singletons for the traced process ---

const projectRoot = findProjectRoot();
const config = loadConfig(projectRoot);

export const contextManager = new TraceContextManager();
export const eventBus = new EventBus();

// Default code version — in production this would come from the build system
const defaultVersion = codeVersion(process.env['TAUTOLOGY_CODE_VERSION'] ?? 'dev');

// --- Serialization ---
const serializer = new ProxySerializer({
  sizeThreshold: config.serialization.defaultSizeThreshold,
  maxDepth: config.serialization.defaultMaxDepth,
  alwaysFullTypes: config.serialization.alwaysFullTypes,
  neverSerializeTypes: config.serialization.neverSerializeTypes,
});
setGlobalSerializer(serializer);

// --- Trace Collection ---
const sigStorePath = join(projectRoot, config.storage.outputDir, 'signatures.json');
const signatureStore = new SignatureStore(sigStorePath);
signatureStore.load();

const traceStorage = new TraceStorage(
  join(projectRoot, config.storage.outputDir),
  config.storage.memoryBufferSize,
);

const assembler = new TraceAssembler(eventBus, signatureStore, {
  pathSignature: config.pathSignature,
});

// When a trace is retained, store it
assembler.onTraceComplete = (trace, reason) => {
  if (reason) {
    traceStorage.store(trace);
  }
};

// --- Module Instrumentation ---

// Install CJS hooks
installCjsHooks(config, contextManager, eventBus, defaultVersion);

// Register ESM hooks
// The ESM hooks run in a separate thread — pass config via data transfer
register('./esm-hooks.js', {
  parentURL: import.meta.url,
  data: { config },
  transferList: [],
});

// --- Process Exit Handling ---
if (config.storage.flushOnExit) {
  process.on('beforeExit', () => {
    assembler.flushPending();
    traceStorage.flush();
    signatureStore.save();
  });
}

console.log(`[tautology] Instrumentation active (root: ${projectRoot})`);
console.log(`[tautology] Include: ${config.include.join(', ')}`);
console.log(`[tautology] Exclude: ${config.exclude.join(', ')}`);
