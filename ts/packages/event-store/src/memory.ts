import type {
  EventStore,
  StoredEvent,
  EventCallback,
  GetEventsOptions,
} from "./types.js";

export class InMemoryEventStore implements EventStore {
  private events = new Map<string, StoredEvent[]>();
  private subscribers = new Map<string, Set<EventCallback>>();

  append(event: StoredEvent): void {
    let list = this.events.get(event.sessionId);
    if (!list) {
      list = [];
      this.events.set(event.sessionId, list);
    }
    list.push(event);

    const subs = this.subscribers.get(event.sessionId);
    if (subs) {
      for (const cb of subs) {
        cb(event);
      }
    }
  }

  getEvents(
    sessionId: string,
    options?: string | GetEventsOptions,
  ): StoredEvent[] {
    const opts: GetEventsOptions =
      typeof options === "string" ? { afterId: options } : (options ?? {});

    let list = this.events.get(sessionId) ?? [];

    if (opts.afterId) {
      const idx = list.findIndex((e) => e.id === opts.afterId);
      if (idx === -1) {
        list = [...list];
      } else {
        list = list.slice(idx + 1);
      }
    } else {
      list = [...list];
    }

    if (opts.offset !== undefined && opts.offset > 0) {
      list = list.slice(opts.offset);
    }

    if (opts.limit !== undefined && opts.limit >= 0) {
      list = list.slice(0, opts.limit);
    }

    return list;
  }

  subscribe(sessionId: string, callback: EventCallback): () => void {
    let subs = this.subscribers.get(sessionId);
    if (!subs) {
      subs = new Set();
      this.subscribers.set(sessionId, subs);
    }
    subs.add(callback);

    return () => {
      subs!.delete(callback);
      if (subs!.size === 0) {
        this.subscribers.delete(sessionId);
      }
    };
  }

  close(): void {
    this.events.clear();
    this.subscribers.clear();
  }
}
