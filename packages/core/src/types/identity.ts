import { randomUUID } from 'node:crypto';

// Branded types for type safety — prevent accidentally passing a SpanId where a TraceId is expected
export type TraceId = string & { readonly __brand: 'TraceId' };
export type SpanId = string & { readonly __brand: 'SpanId' };
export type ComponentFQN = string & { readonly __brand: 'ComponentFQN' };
export type CodeVersion = string & { readonly __brand: 'CodeVersion' };
export type PathSignature = string & { readonly __brand: 'PathSignature' };
export type ObjectId = string & { readonly __brand: 'ObjectId' };

export function createTraceId(): TraceId {
  return randomUUID() as TraceId;
}

export function createSpanId(): SpanId {
  return randomUUID() as SpanId;
}

let objectIdCounter = 0;

export function createObjectId(): ObjectId {
  return `obj_${++objectIdCounter}` as ObjectId;
}

export function resetObjectIdCounter(): void {
  objectIdCounter = 0;
}

export function componentFQN(name: string): ComponentFQN {
  return name as ComponentFQN;
}

export function codeVersion(version: string): CodeVersion {
  return version as CodeVersion;
}

export function pathSignature(hash: string): PathSignature {
  return hash as PathSignature;
}
