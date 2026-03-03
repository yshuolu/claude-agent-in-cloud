import { Hono } from "hono";
import { v4 as uuidv4 } from "uuid";
import {
  createSession,
  getSession,
  deleteSession,
  listSessions,
} from "../session-store.js";

const app = new Hono();

app.post("/", async (c) => {
  const id = uuidv4();
  let projectId = "default";
  try {
    const body = await c.req.json<{ projectId?: string }>();
    if (body.projectId) projectId = body.projectId;
  } catch {
    // No body or invalid JSON — use defaults
  }
  const session = createSession(id, projectId);
  return c.json(session, 201);
});

app.get("/", (c) => {
  return c.json(listSessions());
});

app.get("/:id", (c) => {
  const entry = getSession(c.req.param("id"));
  if (!entry) {
    return c.json({ error: "Session not found" }, 404);
  }
  return c.json(entry.session);
});

app.delete("/:id", async (c) => {
  const deleted = await deleteSession(c.req.param("id"));
  if (!deleted) {
    return c.json({ error: "Session not found" }, 404);
  }
  return c.json({ ok: true });
});

export default app;
