import type { ComponentFQN, CodeVersion, PathSignature, TraceId } from './identity.js';
import type { ComponentType } from './span.js';

/**
 * A JSON-serializable value in a test fixture.
 */
export interface FixtureValue {
  /** Type discriminator for reconstruction: 'string', 'number', 'object', 'Date', 'Map', etc. */
  typeTag: string;
  /** JSON-serializable data */
  data: unknown;
}

/**
 * A mocked dependency call — recorded from the trace, replayed during fixture execution.
 */
export interface MockedCall {
  componentFQN: ComponentFQN;
  /** Order of this call relative to other calls to the same or different dependencies */
  callIndex: number;
  expectedInputs: FixtureValue[];
  returnValue: FixtureValue | null;
  throwException: FixtureValue | null;
}

/**
 * An expected side effect (call to an external dependency) to verify during execution.
 */
export interface SideEffectExpectation {
  componentFQN: ComponentFQN;
  expectedInputs: FixtureValue[];
  callIndex: number;
}

/**
 * A complete test fixture generated from a trace.
 */
export interface TestFixture {
  fixtureId: string;
  name: string;
  generatedAt: string; // ISO 8601
  codeVersion: CodeVersion;

  entryPoint: {
    componentFQN: ComponentFQN;
    componentType: ComponentType;
  };

  inputs: FixtureValue[];
  expectedOutput: FixtureValue | null;
  expectedException: FixtureValue | null;

  mockedDependencies: MockedCall[];
  expectedSideEffects: SideEffectExpectation[];

  sourcePathSignature: PathSignature;
  sourceTraceId: TraceId;
}
