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
import {
  initCommunicateStore,
  initCommunicateSessionUpdater,
} from "./routes/mcp-communicate.js";
import { initGitHubApp } from "./routes/github.js";
import { initGitHubApp as initAgentGitHubApp } from "./agent.js";
import { updateStatus } from "./session-store.js";
import sessions from "./routes/sessions.js";
import tasks from "./routes/tasks.js";
import events from "./routes/events.js";
import projectTasks from "./routes/project-tasks.js";
import mcp from "./routes/mcp.js";
import mcpProjectContext from "./routes/mcp-project-context.js";
import mcpCommunicate from "./routes/mcp-communicate.js";
import projectContext from "./routes/project-context.js";
import cron from "./routes/cron.js";
import github from "./routes/github.js";

const { eventStore, memoryService, agentRunner, agentStore, taskStore, githubApp } =
  await createServices();

initStore(eventStore);
initMemory(memoryService);
initAgentRunner(agentRunner);
initAgentStore(agentStore);
initAuthAgentStore(agentStore);
initTaskStore(taskStore);
initMcpTaskStore(taskStore);
initCronTaskStore(taskStore);
initCommunicateStore(eventStore);
initCommunicateSessionUpdater((id, status) =>
  updateStatus(id, status as Parameters<typeof updateStatus>[1]),
);
initGitHubApp(githubApp);
initAgentGitHubApp(githubApp);

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
app.route("/mcp/project-context", mcpProjectContext);
app.route("/mcp/communicate", mcpCommunicate);
app.route("/mcp", mcp);
app.route("/project-context", projectContext);
app.route("/cron", cron);
app.route("/github", github);

const port = Number(process.env.PORT ?? 8000);

console.log(`Server starting on port ${port}`);

serve({ fetch: app.fetch, port });
