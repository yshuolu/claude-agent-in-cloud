const BASE = "/api";

export interface Session {
  id: string;
  status: "idle" | "running" | "completed" | "error";
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
