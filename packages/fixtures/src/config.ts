/**
 * Configuration for fixture generation.
 */

export interface FixtureGeneratorConfig {
  /** Glob patterns for entry point components (functions under test) */
  entryPointPatterns: string[];
  /** Glob patterns for dependency components (will be mocked in fixtures) */
  dependencyPatterns: string[];
  /** Output directory for fixture files */
  outputDir: string;
  /** Naming strategy for fixture files */
  naming: 'trace-id' | 'component-name' | 'auto';
}

export const DEFAULT_FIXTURE_GENERATOR_CONFIG: FixtureGeneratorConfig = {
  entryPointPatterns: ['**'],
  dependencyPatterns: [],
  outputDir: '.tautology/fixtures',
  naming: 'auto',
};
