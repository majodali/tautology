import type { ComponentFQN } from './identity.js';
import type { ComponentType } from './span.js';

/**
 * A node in a normalized execution path tree.
 * Used for computing path signatures — stripped of timing, versions, and values.
 */
export interface PathNode {
  componentFQN: ComponentFQN;
  componentType: ComponentType;
  children: PathNode[];
  /** Number of consecutive invocations collapsed into this node (1 = no loop) */
  loopCount: number;
}
