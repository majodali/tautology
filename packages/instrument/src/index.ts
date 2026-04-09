// Programmatic API
export { wrapFunction, setMockOverride, setGlobalSerializer, getGlobalSerializer, type WrapOptions, type MockOverride } from './wrap.js';

// Configuration
export { loadConfig, findProjectRoot } from './config-loader.js';

// Boundary matching
export { createBoundaryMatcher, type BoundaryMatcher } from './match.js';

// CJS hooks (for manual installation)
export { installCjsHooks, removeCjsHooks } from './loader/cjs-hooks.js';

// ESM wrap helper
export { __tautologyWrapExports } from './wrap-exports.js';
