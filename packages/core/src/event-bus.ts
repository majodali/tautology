import type { TraceId } from './types/identity.js';
import type { Span } from './types/span.js';
import type { Trace, RetentionReason } from './types/trace.js';

export interface TracingEvents {
  'span:start': (span: Span) => void;
  'span:end': (span: Span) => void;
  'trace:complete': (trace: Trace) => void;
  'trace:retained': (trace: Trace, reason: RetentionReason) => void;
  'trace:discarded': (traceId: TraceId) => void;
}

type EventName = keyof TracingEvents;

export class EventBus {
  private listeners = new Map<EventName, Set<(...args: unknown[]) => void>>();

  on<K extends EventName>(event: K, listener: TracingEvents[K]): void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener as (...args: unknown[]) => void);
  }

  off<K extends EventName>(event: K, listener: TracingEvents[K]): void {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(listener as (...args: unknown[]) => void);
    }
  }

  emit<K extends EventName>(event: K, ...args: Parameters<TracingEvents[K]>): void {
    const set = this.listeners.get(event);
    if (set) {
      for (const listener of set) {
        try {
          listener(...args);
        } catch (err) {
          // Don't let a listener error break other listeners or the traced application
          console.error(`[tautology] EventBus listener error on '${event}':`, err);
        }
      }
    }
  }

  removeAllListeners(event?: EventName): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }
}
