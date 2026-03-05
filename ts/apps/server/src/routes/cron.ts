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

// GET /tasks — fetch todo tasks without spawning agents
app.get("/tasks", async (c) => {
  const tasks = await taskStore.list({ status: "todo" });
  return c.json({ tasks });
});

// POST /run — spawn agents for selected task IDs (or all todo tasks if none specified)
app.post("/run", async (c) => {
  const body = await c.req.json().catch(() => ({})) as { taskIds?: string[] };

  let tasks;
  if (body.taskIds && body.taskIds.length > 0) {
    const all = await taskStore.list({ status: "todo" });
    tasks = all.filter((t) => body.taskIds!.includes(t.id));
  } else {
    tasks = await taskStore.list({ status: "todo" });
  }

  console.log(`[run] Spawning agents for ${tasks.length} task(s):`, tasks.map((t) => t.title));

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
