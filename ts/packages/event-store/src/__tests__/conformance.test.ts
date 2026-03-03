import { describe, it, expect, afterEach } from "vitest";
import { InMemoryEventStore } from "../memory.js";
import type { EventStore, StoredEvent } from "../types.js";

function makeEvent(
  sessionId: string,
  id: string,
  type = "assistant",
): StoredEvent {
  return {
    id,
    sessionId,
    timestamp: new Date().toISOString(),
    type,
    data: { message: `event-${id}` },
  };
}

function conformanceSuite(name: string, factory: () => EventStore) {
  describe(name, () => {
    let store: EventStore;

    afterEach(() => {
      store.close();
    });

    it("appends and retrieves events", () => {
      store = factory();
      const e1 = makeEvent("s1", "e1");
      const e2 = makeEvent("s1", "e2");
      store.append(e1);
      store.append(e2);

      const events = store.getEvents("s1");
      expect(events).toHaveLength(2);
      expect(events[0]!.id).toBe("e1");
      expect(events[1]!.id).toBe("e2");
    });

    it("isolates events by session", () => {
      store = factory();
      store.append(makeEvent("s1", "e1"));
      store.append(makeEvent("s2", "e2"));

      expect(store.getEvents("s1")).toHaveLength(1);
      expect(store.getEvents("s2")).toHaveLength(1);
      expect(store.getEvents("s3")).toHaveLength(0);
    });

    it("supports afterId filtering", () => {
      store = factory();
      store.append(makeEvent("s1", "e1"));
      store.append(makeEvent("s1", "e2"));
      store.append(makeEvent("s1", "e3"));

      const after = store.getEvents("s1", "e1");
      expect(after).toHaveLength(2);
      expect(after[0]!.id).toBe("e2");
    });

    it("notifies subscribers on append", () => {
      store = factory();
      const received: StoredEvent[] = [];
      store.subscribe("s1", (e) => received.push(e));

      store.append(makeEvent("s1", "e1"));
      store.append(makeEvent("s2", "e2")); // different session

      expect(received).toHaveLength(1);
      expect(received[0]!.id).toBe("e1");
    });

    it("unsubscribe stops notifications", () => {
      store = factory();
      const received: StoredEvent[] = [];
      const unsub = store.subscribe("s1", (e) => received.push(e));

      store.append(makeEvent("s1", "e1"));
      unsub();
      store.append(makeEvent("s1", "e2"));

      expect(received).toHaveLength(1);
    });

    it("supports offset", () => {
      store = factory();
      store.append(makeEvent("s1", "e1"));
      store.append(makeEvent("s1", "e2"));
      store.append(makeEvent("s1", "e3"));

      const events = store.getEvents("s1", { offset: 1 });
      expect(events).toHaveLength(2);
      expect(events[0]!.id).toBe("e2");
      expect(events[1]!.id).toBe("e3");
    });

    it("supports limit", () => {
      store = factory();
      store.append(makeEvent("s1", "e1"));
      store.append(makeEvent("s1", "e2"));
      store.append(makeEvent("s1", "e3"));

      const events = store.getEvents("s1", { limit: 2 });
      expect(events).toHaveLength(2);
      expect(events[0]!.id).toBe("e1");
      expect(events[1]!.id).toBe("e2");
    });

    it("supports combined offset and limit", () => {
      store = factory();
      store.append(makeEvent("s1", "e1"));
      store.append(makeEvent("s1", "e2"));
      store.append(makeEvent("s1", "e3"));
      store.append(makeEvent("s1", "e4"));

      const events = store.getEvents("s1", { offset: 1, limit: 2 });
      expect(events).toHaveLength(2);
      expect(events[0]!.id).toBe("e2");
      expect(events[1]!.id).toBe("e3");
    });

    it("supports afterId with offset and limit", () => {
      store = factory();
      store.append(makeEvent("s1", "e1"));
      store.append(makeEvent("s1", "e2"));
      store.append(makeEvent("s1", "e3"));
      store.append(makeEvent("s1", "e4"));
      store.append(makeEvent("s1", "e5"));

      const events = store.getEvents("s1", {
        afterId: "e1",
        offset: 1,
        limit: 2,
      });
      expect(events).toHaveLength(2);
      expect(events[0]!.id).toBe("e3");
      expect(events[1]!.id).toBe("e4");
    });

    it("supports GetEventsOptions object with afterId only", () => {
      store = factory();
      store.append(makeEvent("s1", "e1"));
      store.append(makeEvent("s1", "e2"));
      store.append(makeEvent("s1", "e3"));

      const events = store.getEvents("s1", { afterId: "e1" });
      expect(events).toHaveLength(2);
      expect(events[0]!.id).toBe("e2");
    });

    it("preserves event data through round-trip", () => {
      store = factory();
      const event: StoredEvent = {
        id: "e1",
        sessionId: "s1",
        timestamp: "2026-01-01T00:00:00.000Z",
        type: "result",
        data: { nested: { key: "value" }, arr: [1, 2, 3] },
      };
      store.append(event);

      const [retrieved] = store.getEvents("s1");
      expect(retrieved!.data).toEqual(event.data);
    });
  });
}

conformanceSuite("InMemoryEventStore", () => new InMemoryEventStore());
