import { Hono } from "hono";
import { getSession } from "../session-store.js";
import { runAgent } from "../agent.js";

const app = new Hono();

app.post("/:id/tasks", async (c) => {
  const sessionId = c.req.param("id");
  const entry = getSession(sessionId);
  if (!entry) {
    return c.json({ error: "Session not found" }, 404);
  }

  const body = await c.req.json<{ prompt?: string }>();
  if (!body.prompt) {
    return c.json({ error: "prompt is required" }, 400);
  }

  // runAgent handles both first turn (spawns container) and follow-ups (sends via stdin)
  runAgent({
    sessionId,
    prompt: body.prompt,
    projectId: entry.projectId,
  }).catch(() => {
    // Errors are already handled inside runAgent
  });

  return c.json({ status: "started", sessionId }, 202);
});

export default app;
