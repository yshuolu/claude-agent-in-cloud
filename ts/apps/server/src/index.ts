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
import { initAgentRunner } from "./agent.js";
import sessions from "./routes/sessions.js";
import tasks from "./routes/tasks.js";
import events from "./routes/events.js";

const { eventStore, memoryService, agentRunner } = await createServices();

initStore(eventStore);
initMemory(memoryService);
initAgentRunner(agentRunner);

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

const port = Number(process.env.PORT ?? 8000);

console.log(`Server starting on port ${port}`);

serve({ fetch: app.fetch, port });
