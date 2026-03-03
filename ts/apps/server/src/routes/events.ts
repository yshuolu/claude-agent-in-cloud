import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { StoredEvent } from "@cloud-agent/event-store";
import { getSession, getEventStore, appendEvent } from "../session-store.js";
import { agentAuth } from "../middleware/auth.js";

const app = new Hono();

// POST /:id/events — agent writes events via HTTP (auth required)
app.post("/:id/events", agentAuth, async (c) => {
  const sessionId = c.req.param("id");
  const entry = getSession(sessionId);
  if (!entry) {
    return c.json({ error: "Session not found" }, 404);
  }

  const body = (await c.req.json()) as StoredEvent;

  if (body.sessionId !== sessionId) {
    return c.json({ error: "sessionId mismatch" }, 400);
  }

  appendEvent(sessionId, body);
  return c.json({ ok: true }, 201);
});

// GET /:id/events — SSE streaming or range query
app.get("/:id/events", (c) => {
  const sessionId = c.req.param("id");
  const entry = getSession(sessionId);
  if (!entry) {
    return c.json({ error: "Session not found" }, 404);
  }

  const store = getEventStore();

  // Range/partial download: when limit query param is present, return JSON
  const limitParam = c.req.query("limit");
  if (limitParam !== undefined) {
    const afterId = c.req.query("afterId");
    const offset = c.req.query("offset");
    const limit = parseInt(limitParam, 10);

    const events = store.getEvents(sessionId, {
      afterId: afterId || undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
      limit,
    });

    // Check if there are more events beyond this page
    const nextEvents = store.getEvents(sessionId, {
      afterId: afterId || undefined,
      offset: (offset ? parseInt(offset, 10) : 0) + limit,
      limit: 1,
    });

    return c.json({ events, hasMore: nextEvents.length > 0 });
  }

  // SSE streaming mode
  const lastEventId = c.req.header("Last-Event-ID");

  return streamSSE(c, async (stream) => {
    // Replay existing events (all, or after Last-Event-ID)
    const existing = store.getEvents(sessionId, lastEventId);
    for (const event of existing) {
      await stream.writeSSE({
        id: event.id,
        event: event.type,
        data: JSON.stringify(event),
      });
    }

    // If session is already done, close the stream
    if (
      entry.session.status === "completed" ||
      entry.session.status === "error"
    ) {
      await stream.writeSSE({
        event: "done",
        data: JSON.stringify({ status: entry.session.status }),
      });
      return;
    }

    // Use subscribe() for instant delivery of new events
    await new Promise<void>((resolve) => {
      const unsubscribe = store.subscribe(sessionId, async (event) => {
        try {
          await stream.writeSSE({
            id: event.id,
            event: event.type,
            data: JSON.stringify(event),
          });
        } catch {
          unsubscribe();
          clearInterval(statusCheck);
          resolve();
        }
      });

      // Check session completion status periodically
      const statusCheck = setInterval(() => {
        const current = getSession(sessionId);
        if (
          !current ||
          current.session.status === "completed" ||
          current.session.status === "error"
        ) {
          clearInterval(statusCheck);
          unsubscribe();
          stream
            .writeSSE({
              event: "done",
              data: JSON.stringify({
                status: current?.session.status ?? "deleted",
              }),
            })
            .finally(resolve);
        }
      }, 500);

      stream.onAbort(() => {
        unsubscribe();
        clearInterval(statusCheck);
        resolve();
      });
    });
  });
});

export default app;
