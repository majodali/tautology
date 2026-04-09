/**
 * Path signature computation.
 *
 * Converts a span tree into a normalized PathNode tree, then hashes it
 * to produce a stable, version-independent path signature.
 *
 * Normalizations:
 * - Strip timing, values, tags, and code versions
 * - Collapse loops: N consecutive children with the same FQN become one node with loopCount=N
 * - Collapse recursion: if a node's FQN appears in its ancestor chain, truncate the subtree
 * - Truncate at maxDepth
 * - Optionally ignore specific components
 */

import { createHash } from 'node:crypto';
import type { Span, PathSignature, PathSignatureConfig, PathNode, ComponentFQN } from '@tautology/core';
import { pathSignature, DEFAULT_PATH_SIGNATURE_CONFIG } from '@tautology/core';

export function computePathSignature(
  rootSpan: Span,
  config?: PathSignatureConfig,
): PathSignature {
  const cfg = config ?? DEFAULT_PATH_SIGNATURE_CONFIG;
  const tree = buildPathTree(rootSpan, cfg, [], 0);
  const canonical = canonicalize(tree);
  const hash = createHash('sha256').update(canonical).digest('hex').slice(0, 16);
  return pathSignature(hash);
}

/**
 * Build a normalized PathNode tree from a span tree.
 */
function buildPathTree(
  span: Span,
  config: PathSignatureConfig,
  ancestors: ComponentFQN[],
  depth: number,
): PathNode {
  // Recursion check: if this FQN is in the ancestor chain, return a leaf
  if (config.collapseRecursion && ancestors.includes(span.componentFQN)) {
    return {
      componentFQN: span.componentFQN,
      componentType: span.componentType,
      children: [],
      loopCount: 1,
    };
  }

  // Depth check
  if (depth >= config.maxDepth) {
    return {
      componentFQN: span.componentFQN,
      componentType: span.componentType,
      children: [],
      loopCount: 1,
    };
  }

  // Filter out ignored components from children
  const filteredChildren = span.children.filter(
    child => !config.ignoredComponents.includes(child.componentFQN),
  );

  // Build child nodes
  const newAncestors = [...ancestors, span.componentFQN];
  const rawChildren = filteredChildren.map(child =>
    buildPathTree(child, config, newAncestors, depth + 1),
  );

  // Collapse loops: consecutive children with the same FQN
  const collapsedChildren = config.collapseLoops
    ? collapseConsecutiveLoops(rawChildren)
    : rawChildren;

  return {
    componentFQN: span.componentFQN,
    componentType: span.componentType,
    children: collapsedChildren,
    loopCount: 1,
  };
}

/**
 * Collapse consecutive children with the same FQN into a single node with loopCount > 1.
 */
function collapseConsecutiveLoops(children: PathNode[]): PathNode[] {
  if (children.length === 0) return [];

  const result: PathNode[] = [];
  let current = children[0];
  let count = 1;

  for (let i = 1; i < children.length; i++) {
    const next = children[i];
    if (
      next.componentFQN === current.componentFQN &&
      next.componentType === current.componentType &&
      childrenAreStructurallyEqual(current.children, next.children)
    ) {
      count++;
    } else {
      result.push({ ...current, loopCount: count });
      current = next;
      count = 1;
    }
  }
  result.push({ ...current, loopCount: count });

  return result;
}

/**
 * Check if two child arrays are structurally equal (same FQNs and types in same order).
 * This is a shallow check — used for loop collapsing to detect repeated patterns.
 */
function childrenAreStructurallyEqual(a: PathNode[], b: PathNode[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].componentFQN !== b[i].componentFQN) return false;
    if (a[i].componentType !== b[i].componentType) return false;
  }
  return true;
}

/**
 * Canonicalize a PathNode tree to a stable JSON string.
 * Keys are sorted to ensure deterministic output.
 */
function canonicalize(node: PathNode): string {
  const obj = canonicalObject(node);
  return JSON.stringify(obj);
}

function canonicalObject(node: PathNode): Record<string, unknown> {
  const obj: Record<string, unknown> = {
    c: node.children.map(canonicalObject),
    f: node.componentFQN,
    l: node.loopCount,
    t: node.componentType,
  };
  return obj;
}
