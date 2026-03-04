import { resolve, dirname } from "node:path";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { EventStore } from "@cloud-agent/event-store";
import type { MemoryService } from "@cloud-agent/memory-service";
import type { AgentRunner, AgentStore } from "@cloud-agent/agent-manager";
import type { TaskStore } from "@cloud-agent/project-management";
import type { GitHubAppService } from "@cloud-agent/github-app";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface Services {
  eventStore: EventStore;
  memoryService: MemoryService;
  agentRunner: AgentRunner;
  agentStore: AgentStore;
  taskStore: TaskStore;
  githubApp: GitHubAppService | null;
}

export async function createServices(): Promise<Services> {
  // Event store — always in-memory (agents send events via HTTP POST)
  const { InMemoryEventStore } = await import("@cloud-agent/event-store");
  const eventStore = new InMemoryEventStore();

  // Memory service — always in-memory
  const { InMemoryMemoryService } = await import(
    "@cloud-agent/memory-service"
  );
  const memoryService = new InMemoryMemoryService();

  // Agent runner
  const runnerType = process.env.AGENT_RUNNER ?? "docker";
  let agentRunner: AgentRunner;

  switch (runnerType) {
    case "flyio": {
      const { FlyRunner } = await import("@cloud-agent/agent-manager");
      const apiToken = process.env.FLY_API_TOKEN;
      const appName = process.env.FLY_APP_NAME;
      const agentImage = process.env.FLY_AGENT_IMAGE;
      if (!apiToken || !appName || !agentImage) {
        throw new Error(
          "FLY_API_TOKEN, FLY_APP_NAME, and FLY_AGENT_IMAGE are required for flyio runner",
        );
      }
      agentRunner = new FlyRunner({
        apiToken,
        appName,
        agentImage,
        region: process.env.FLY_REGION,
      });
      break;
    }
    case "docker":
    default: {
      const { DockerRunner } = await import("@cloud-agent/agent-manager");
      const projectRoot = resolve(__dirname, "../../../..");
      agentRunner = new DockerRunner(
        process.env.AGENT_IMAGE ?? "cloud-agent-runner",
        undefined,
        {
          dockerfile: process.env.AGENT_DOCKERFILE ?? "docker/Dockerfile.agent",
          context: projectRoot,
        },
      );
      break;
    }
  }

  // SQLite stores — ensure data directory exists
  const dataDir = resolve(__dirname, "../../../data");
  mkdirSync(dataDir, { recursive: true });

  const { SqliteAgentStore } = await import("@cloud-agent/agent-manager");
  const agentDbPath = process.env.AGENT_DB_PATH ?? resolve(dataDir, "agents.db");
  const agentStore = new SqliteAgentStore(agentDbPath);

  // Task store — SQLite (default), Lark, or Linear
  const taskStoreType = process.env.TASK_STORE ?? "sqlite";
  let taskStore: TaskStore;

  switch (taskStoreType) {
    case "linear": {
      const { LinearTaskStore } = await import(
        "@cloud-agent/task-store-linear"
      );
      if (!process.env.LINEAR_API_KEY) {
        throw new Error(
          "LINEAR_API_KEY is required for linear task store",
        );
      }
      taskStore = new LinearTaskStore({
        apiKey: process.env.LINEAR_API_KEY,
        teamId: process.env.LINEAR_TEAM_ID,
        projectId: process.env.LINEAR_PROJECT_ID,
      });
      break;
    }
    case "lark": {
      const { LarkTaskStore } = await import("@cloud-agent/task-store-lark");
      if (!process.env.LARK_APP_ID || !process.env.LARK_APP_SECRET) {
        throw new Error(
          "LARK_APP_ID and LARK_APP_SECRET are required for lark task store",
        );
      }
      taskStore = new LarkTaskStore({
        appId: process.env.LARK_APP_ID,
        appSecret: process.env.LARK_APP_SECRET,
        baseUrl: process.env.LARK_BASE_URL,
      });
      break;
    }
    case "sqlite":
    default: {
      const { SqliteTaskStore } = await import(
        "@cloud-agent/project-management"
      );
      const taskDbPath =
        process.env.TASK_DB_PATH ?? resolve(dataDir, "tasks.db");
      taskStore = new SqliteTaskStore(taskDbPath);
      break;
    }
  }

  // GitHub App — optional, configured via env vars
  let githubApp: GitHubAppService | null = null;
  const ghAppId = process.env.GITHUB_APP_ID;
  const ghPrivateKey = process.env.GITHUB_APP_PRIVATE_KEY;
  if (ghAppId && ghPrivateKey) {
    const { DefaultGitHubAppService } = await import(
      "@cloud-agent/github-app"
    );
    githubApp = new DefaultGitHubAppService(ghAppId, ghPrivateKey);
  }

  console.log("Event store: in-memory");
  console.log("Memory service: in-memory");
  console.log(`Agent runner: ${runnerType}`);
  console.log(`Agent store: SQLite (${agentDbPath})`);
  console.log(`Task store: ${taskStoreType}`);
  console.log(`GitHub App: ${githubApp ? "configured" : "not configured"}`);

  return { eventStore, memoryService, agentRunner, agentStore, taskStore, githubApp };
}
