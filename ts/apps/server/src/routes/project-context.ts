import { Hono } from "hono";
import {
  getProjectContext,
  setProjectContext,
  getGitHubToken,
  setGitHubToken,
  clearGitHubToken,
  detectGitHubToken,
  maskToken,
} from "../project-context.js";

const app = new Hono();

app.get("/", (c) => {
  return c.json({ content: getProjectContext() });
});

app.put("/", async (c) => {
  const { content } = await c.req.json<{ content: string }>();
  setProjectContext(content);
  return c.json({ ok: true });
});

// --- GitHub Token ---

app.get("/github-token", (c) => {
  const token = getGitHubToken();
  if (token) {
    return c.json({ configured: true, masked: maskToken(token) });
  }
  return c.json({ configured: false });
});

app.put("/github-token", async (c) => {
  const { token } = await c.req.json<{ token: string }>();
  if (!token?.trim()) {
    return c.json({ error: "Token is required" }, 400);
  }
  setGitHubToken(token);
  return c.json({ configured: true, masked: maskToken(token.trim()) });
});

app.delete("/github-token", (c) => {
  clearGitHubToken();
  return c.json({ configured: false });
});

app.post("/github-token/detect", (c) => {
  const token = detectGitHubToken();
  if (token) {
    setGitHubToken(token);
    return c.json({ configured: true, masked: maskToken(token) });
  }
  return c.json({ configured: false });
});

export default app;
