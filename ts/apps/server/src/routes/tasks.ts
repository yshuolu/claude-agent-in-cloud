import { Hono } from "hono";
import { getSession } from "../session-store.js";
import { sendPrompt } from "../agent.js";

interface RepoContext {
  owner: string;
  repo: string;
  fullName: string;
  branch: string;
  cloneUrl: string;
}

function buildPromptWithRepo(prompt: string, repo: RepoContext): string {
  return `Before starting the task, clone the repository and work inside it:
1. Run: git clone --branch ${repo.branch} --single-branch ${repo.cloneUrl} /workspace/${repo.repo}
2. cd into /workspace/${repo.repo}
3. All subsequent work should happen there.

Repository: ${repo.fullName} (branch: ${repo.branch})

Task: ${prompt}`;
}

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

  const body = await c.req.json<{ prompt?: string; repoContext?: RepoContext }>();
  if (!body.prompt) {
    return c.json({ error: "prompt is required" }, 400);
  }

  const finalPrompt = body.repoContext
    ? buildPromptWithRepo(body.prompt, body.repoContext)
    : body.prompt;

  const err = await sendPrompt(sessionId, finalPrompt);
  if (err) {
    return c.json({ error: err }, 409);
  }

  return c.json({ status: "started", sessionId }, 202);
});

export default app;
