import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventStore } from "@cloud-agent/event-store";
import type { MemoryService } from "@cloud-agent/memory-service";
import type { AgentRunner } from "@cloud-agent/agent-manager";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface Services {
  eventStore: EventStore;
  memoryService: MemoryService;
  agentRunner: AgentRunner;
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
    case "subprocess": {
      const { SubprocessRunner } = await import(
        "@cloud-agent/agent-manager"
      );
      const defaultScript = resolve(
        __dirname,
        "../../../packages/agent-local/dist/index.js",
      );
      agentRunner = new SubprocessRunner(
        process.env.AGENT_SCRIPT_PATH ?? defaultScript,
      );
      break;
    }
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
      agentRunner = new DockerRunner(
        process.env.AGENT_IMAGE ?? "cloud-agent-runner",
      );
      break;
    }
  }

  console.log("Event store: in-memory");
  console.log("Memory service: in-memory");
  console.log(`Agent runner: ${runnerType}`);

  return { eventStore, memoryService, agentRunner };
}
