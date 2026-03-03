import { Hono } from "hono";
import { getSession } from "../session-store.js";
import { sendPrompt } from "../agent.js";

const app = new Hono();

app.post("/:id/tasks", async (c) => {
  const sessionId = c.req.param("id");
  const entry = getSession(sessionId);
  if (!entry) {
    return c.json({ error: "Session not found" }, 404);
  }

  if (entry.session.status === "starting") {
    return c.json({ error: "Agent container is still starting" }, 409);
  }

  const body = await c.req.json<{ prompt?: string }>();
  if (!body.prompt) {
    return c.json({ error: "prompt is required" }, 400);
  }

  const err = await sendPrompt(sessionId, body.prompt);
  if (err) {
    return c.json({ error: err }, 409);
  }

  return c.json({ status: "started", sessionId }, 202);
});

export default app;
