import type { ComponentFQN } from './identity.js';

export interface ComponentConfig {
  /** Byte threshold — below this, values are fully serialized */
  sizeThreshold: number;
  captureInputs: boolean;
  captureOutputs: boolean;
  maxSerializationDepth: number;
}

export interface SerializationConfig {
  defaultSizeThreshold: number;
  defaultMaxDepth: number;
  /** Types that are always fully serialized regardless of size */
  alwaysFullTypes: string[];
  /** Types that are never serialized (streams, sockets, etc.) */
  neverSerializeTypes: string[];
}

export interface PathSignatureConfig {
  maxDepth: number;
  collapseRecursion: boolean;
  collapseLoops: boolean;
  includeComponentTypes: boolean;
  ignoredComponents: ComponentFQN[];
}

export interface StorageConfig {
  outputDir: string;
  /** Max traces to buffer in memory before flushing */
  memoryBufferSize: number;
  flushOnExit: boolean;
}

export interface BoundaryConfig {
  /** Glob patterns for component FQNs to instrument */
  include: string[];
  /** Glob patterns for component FQNs to exclude */
  exclude: string[];
  /** Per-component overrides keyed by FQN pattern */
  overrides: Record<string, Partial<ComponentConfig>>;
  serialization: SerializationConfig;
  pathSignature: PathSignatureConfig;
  storage: StorageConfig;
}

export const DEFAULT_COMPONENT_CONFIG: ComponentConfig = {
  sizeThreshold: 16384,
  captureInputs: true,
  captureOutputs: true,
  maxSerializationDepth: 8,
};

export const DEFAULT_SERIALIZATION_CONFIG: SerializationConfig = {
  defaultSizeThreshold: 16384,
  defaultMaxDepth: 8,
  alwaysFullTypes: [],
  neverSerializeTypes: [],
};

export const DEFAULT_PATH_SIGNATURE_CONFIG: PathSignatureConfig = {
  maxDepth: 10,
  collapseRecursion: true,
  collapseLoops: true,
  includeComponentTypes: true,
  ignoredComponents: [],
};

export const DEFAULT_STORAGE_CONFIG: StorageConfig = {
  outputDir: '.tautology/traces',
  memoryBufferSize: 100,
  flushOnExit: true,
};

export const DEFAULT_BOUNDARY_CONFIG: BoundaryConfig = {
  include: ['**'],
  exclude: ['node_modules/**'],
  overrides: {},
  serialization: DEFAULT_SERIALIZATION_CONFIG,
  pathSignature: DEFAULT_PATH_SIGNATURE_CONFIG,
  storage: DEFAULT_STORAGE_CONFIG,
};
