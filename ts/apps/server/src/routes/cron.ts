import { Hono } from "hono";
import { v4 as uuidv4 } from "uuid";
import type { TaskStore } from "@cloud-agent/project-management";
import { createSession } from "../session-store.js";
import { spawnAgent, sendPrompt } from "../agent.js";

let taskStore: TaskStore;

export function initCronTaskStore(store: TaskStore): void {
  taskStore = store;
}

const app = new Hono();

// POST /run — fetch todo tasks, create a session + agent per task, send prompt
app.post("/run", async (c) => {
  const tasks = await taskStore.list({ status: "todo" });
  console.log(`[run] Found ${tasks.length} todo task(s):`, tasks.map((t) => t.title));

  if (tasks.length === 0) {
    return c.json({ tasks: [], sessions: [] });
  }

  const results: { taskId: string; taskTitle: string; sessionId: string }[] = [];

  for (const task of tasks) {
    const sessionId = uuidv4();
    const projectId = process.env.DEFAULT_PROJECT_ID ?? "default";
    createSession(sessionId, projectId);

    const prompt = `Task: ${task.title}\n\n${task.description}`;

    // Spawn agent and send prompt once ready
    spawnAgent(sessionId, projectId)
      .then(() => sendPrompt(sessionId, prompt))
      .catch((err) => {
        console.error(`[run] Failed to run task "${task.title}":`, err);
      });

    results.push({
      taskId: task.id,
      taskTitle: task.title,
      sessionId,
    });
  }

  return c.json({ tasks, sessions: results });
});

export default app;
