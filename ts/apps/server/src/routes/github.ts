import { Hono } from "hono";
import type { GitHubAppService } from "@cloud-agent/github-app";
import { getGitHubToken } from "../project-context.js";

let githubApp: GitHubAppService | null = null;

export function initGitHubApp(service: GitHubAppService | null): void {
  githubApp = service;
}

export function getGitHubApp(): GitHubAppService | null {
  return githubApp;
}

const app = new Hono();

// --- PAT-based repo/branch listing (Codex-style) ---

app.get("/repos", async (c) => {
  const token = getGitHubToken();
  if (!token) {
    return c.json({ error: "No GitHub token configured" }, 401);
  }

  const q = c.req.query("q");
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  try {
    let repos: unknown[];

    if (q) {
      // Search user's repos
      const res = await fetch(
        `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}+in:name&sort=updated&per_page=30`,
        { headers },
      );
      if (!res.ok) {
        return c.json({ error: `GitHub API error: ${res.status}` }, 502);
      }
      const data = (await res.json()) as { items: Record<string, unknown>[] };
      repos = data.items;
    } else {
      // List user's repos sorted by recently pushed
      const res = await fetch(
        "https://api.github.com/user/repos?sort=pushed&per_page=30",
        { headers },
      );
      if (!res.ok) {
        return c.json({ error: `GitHub API error: ${res.status}` }, 502);
      }
      repos = (await res.json()) as Record<string, unknown>[];
    }

    const mapped = (repos as Record<string, unknown>[]).map((r) => ({
      id: r.id,
      name: r.name,
      fullName: r.full_name,
      private: r.private,
      defaultBranch: r.default_branch,
      url: r.html_url,
      owner: (r.owner as Record<string, unknown>)?.login,
    }));

    return c.json(mapped);
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : String(err) },
      502,
    );
  }
});

app.get("/repos/:owner/:repo/branches", async (c) => {
  const token = getGitHubToken();
  if (!token) {
    return c.json({ error: "No GitHub token configured" }, 401);
  }

  const owner = c.req.param("owner");
  const repo = c.req.param("repo");
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  try {
    const res = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches?per_page=100`,
      { headers },
    );
    if (!res.ok) {
      return c.json({ error: `GitHub API error: ${res.status}` }, 502);
    }
    const branches = (await res.json()) as Record<string, unknown>[];
    const mapped = branches.map((b) => ({
      name: b.name,
      protected: b.protected,
    }));
    return c.json(mapped);
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : String(err) },
      502,
    );
  }
});

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
