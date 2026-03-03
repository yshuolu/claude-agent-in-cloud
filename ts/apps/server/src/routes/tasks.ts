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
  if (entry.session.status === "running") {
    return c.json({ error: "Session already has a running task" }, 409);
  }

  const body = await c.req.json<{ prompt?: string; resume?: boolean }>();
  if (!body.prompt) {
    return c.json({ error: "prompt is required" }, 400);
  }

  // Start agent in background — don't await
  runAgent({
    sessionId,
    prompt: body.prompt,
    projectId: entry.projectId,
    resume: body.resume,
  }).catch(() => {
    // Errors are already handled inside runAgent
  });

  return c.json({ status: "started", sessionId }, 202);
});

export default app;
