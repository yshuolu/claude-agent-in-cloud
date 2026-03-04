import { Hono } from "hono";
import type { GitHubAppService } from "@cloud-agent/github-app";

let githubApp: GitHubAppService | null = null;

export function initGitHubApp(service: GitHubAppService | null): void {
  githubApp = service;
}

export function getGitHubApp(): GitHubAppService | null {
  return githubApp;
}

const app = new Hono();

app.get("/installations", async (c) => {
  if (!githubApp) {
    return c.json({ error: "GitHub App not configured" }, 501);
  }
  try {
    const installations = await githubApp.listInstallations();
    return c.json(installations);
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : String(err) },
      502,
    );
  }
});

app.get("/installations/:id", async (c) => {
  if (!githubApp) {
    return c.json({ error: "GitHub App not configured" }, 501);
  }
  const id = Number(c.req.param("id"));
  if (Number.isNaN(id)) {
    return c.json({ error: "Invalid installation ID" }, 400);
  }
  try {
    const installation = await githubApp.getInstallation(id);
    return c.json(installation);
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : String(err) },
      502,
    );
  }
});

app.get("/installations/:id/repos", async (c) => {
  if (!githubApp) {
    return c.json({ error: "GitHub App not configured" }, 501);
  }
  const id = Number(c.req.param("id"));
  if (Number.isNaN(id)) {
    return c.json({ error: "Invalid installation ID" }, 400);
  }
  try {
    const repos = await githubApp.listRepositories(id);
    return c.json(repos);
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : String(err) },
      502,
    );
  }
});

app.get("/status", (c) => {
  const configured = githubApp !== null;
  const appSlug = process.env.GITHUB_APP_SLUG;
  return c.json({ configured, ...(appSlug ? { appSlug } : {}) });
});

export default app;
