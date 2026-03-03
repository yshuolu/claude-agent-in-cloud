import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Walk up from the source file to find .env at the project root
let dir = dirname(fileURLToPath(import.meta.url));
while (dir !== dirname(dir)) {
  const candidate = resolve(dir, ".env");
  if (existsSync(candidate)) {
    config({ path: candidate });
    break;
  }
  dir = dirname(dir);
}

import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { createServices } from "./services.js";
import { initStore, initMemory } from "./session-store.js";
import { initAgentRunner, initAgentStore } from "./agent.js";
import { initAgentStore as initAuthAgentStore } from "./middleware/auth.js";
import { initTaskStore } from "./routes/project-tasks.js";
import { initMcpTaskStore } from "./routes/mcp.js";
import { initCronTaskStore } from "./routes/cron.js";
import sessions from "./routes/sessions.js";
import tasks from "./routes/tasks.js";
import events from "./routes/events.js";
import projectTasks from "./routes/project-tasks.js";
import mcp from "./routes/mcp.js";
import cron from "./routes/cron.js";

const { eventStore, memoryService, agentRunner, agentStore, taskStore } =
  await createServices();

initStore(eventStore);
initMemory(memoryService);
initAgentRunner(agentRunner);
initAgentStore(agentStore);
initAuthAgentStore(agentStore);
initTaskStore(taskStore);
initMcpTaskStore(taskStore);
initCronTaskStore(taskStore);

const app = new Hono();

app.use(
  "*",
  cors({
    origin: process.env.CORS_ORIGINS?.split(",") ?? ["http://localhost:3000"],
  }),
);

app.get("/health", (c) => c.json({ ok: true }));

app.route("/sessions", sessions);
app.route("/sessions", tasks);
app.route("/sessions", events);
app.route("/tasks", projectTasks);
app.route("/mcp", mcp);
app.route("/cron", cron);

const port = Number(process.env.PORT ?? 8000);

console.log(`Server starting on port ${port}`);

serve({ fetch: app.fetch, port });
