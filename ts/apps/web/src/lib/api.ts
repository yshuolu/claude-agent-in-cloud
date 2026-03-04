const BASE = "/api";

export interface Session {
  id: string;
  status: "starting" | "idle" | "running" | "completed" | "error";
  createdAt: string;
  updatedAt: string;
}

export async function createSession(): Promise<Session> {
  const res = await fetch(`${BASE}/sessions`, { method: "POST" });
  return res.json();
}

export async function listSessions(): Promise<Session[]> {
  const res = await fetch(`${BASE}/sessions`);
  return res.json();
}

export async function getSession(id: string): Promise<Session> {
  const res = await fetch(`${BASE}/sessions/${id}`);
  return res.json();
}

export async function deleteSession(id: string): Promise<void> {
  await fetch(`${BASE}/sessions/${id}`, { method: "DELETE" });
}

export async function submitTask(
  sessionId: string,
  prompt: string,
): Promise<void> {
  await fetch(`${BASE}/sessions/${sessionId}/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
}

export function eventsUrl(sessionId: string): string {
  return `${BASE}/sessions/${sessionId}/events`;
}

export interface CronTask {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  assignee: string | null;
  labels: string[];
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RunResult {
  tasks: CronTask[];
  sessions: { taskId: string; taskTitle: string; sessionId: string }[];
}

export async function runCron(): Promise<RunResult> {
  const res = await fetch(`${BASE}/cron/run`, { method: "POST" });
  return res.json();
}

// --- GitHub ---

export interface GitHubStatus {
  configured: boolean;
  appSlug?: string;
}

export interface GitHubInstallation {
  id: number;
  account: { login: string; id: number; type: string };
}

export interface GitHubRepo {
  id: number;
  name: string;
  fullName: string;
  private: boolean;
  defaultBranch: string;
  url: string;
}

export async function getGitHubStatus(): Promise<GitHubStatus> {
  const res = await fetch(`${BASE}/github/status`);
  return res.json();
}

export async function listGitHubInstallations(): Promise<GitHubInstallation[]> {
  const res = await fetch(`${BASE}/github/installations`);
  if (res.status === 501) return [];
  return res.json();
}

export async function listGitHubRepos(
  installationId: number,
): Promise<GitHubRepo[]> {
  const res = await fetch(
    `${BASE}/github/installations/${installationId}/repos`,
  );
  if (!res.ok) return [];
  return res.json();
}

// --- Project Context ---

export async function getProjectContext(): Promise<string> {
  const res = await fetch(`${BASE}/project-context`);
  const data = await res.json();
  return data.content;
}

export async function updateProjectContext(content: string): Promise<void> {
  await fetch(`${BASE}/project-context`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
}
