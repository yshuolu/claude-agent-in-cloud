import { v4 as uuidv4 } from "uuid";
import type { StoredEvent } from "@cloud-agent/event-store";
import type { AgentRunner, AgentHandle, AgentStore } from "@cloud-agent/agent-manager";
import {
  appendEvent,
  updateStatus,
  setStopFn,
  getSession,
  getEventStore,
  getMemoryService,
} from "./session-store.js";

let agentRunner: AgentRunner;
let agentStore: AgentStore;

// Track live agent handles per session
const agentHandles = new Map<string, AgentHandle>();

export function initAgentRunner(runner: AgentRunner): void {
  agentRunner = runner;
}

export function initAgentStore(store: AgentStore): void {
  agentStore = store;
}

export interface RunAgentOptions {
  sessionId: string;
  prompt: string;
  projectId: string;
}

export async function runAgent(options: RunAgentOptions): Promise<void> {
  const { sessionId, prompt, projectId } = options;

  // If an agent is already running for this session, send the follow-up prompt
  const existingHandle = agentHandles.get(sessionId);
  if (existingHandle) {
    updateStatus(sessionId, "running");
    await existingHandle.send(prompt);
    return;
  }

  // First turn — spawn a new agent container
  updateStatus(sessionId, "running");

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const errorEvent: StoredEvent = {
      id: uuidv4(),
      sessionId,
      timestamp: new Date().toISOString(),
      type: "error",
      data: { message: "ANTHROPIC_API_KEY is not set" },
    };
    appendEvent(sessionId, errorEvent);
    updateStatus(sessionId, "error");
    return;
  }

  // From inside Docker, localhost refers to the container — use host.docker.internal on macOS/Windows
  const serverUrl =
    process.env.SERVER_URL ??
    `http://host.docker.internal:${process.env.PORT ?? "8000"}`;

  const authToken = uuidv4();
  const agentId = uuidv4();

  // Persist agent record with auth token
  agentStore.save({
    id: agentId,
    sessionId,
    status: "running",
    authToken,
    createdAt: new Date().toISOString(),
    stoppedAt: null,
  });

  let handle: AgentHandle;
  try {
    handle = await agentRunner.spawn({
      sessionId,
      model: process.env.CLAUDE_MODEL ?? "claude-sonnet-4-5-20250929",
      apiKey,
      serverUrl,
      authToken,
    });
  } catch (err) {
    const errorEvent: StoredEvent = {
      id: uuidv4(),
      sessionId,
      timestamp: new Date().toISOString(),
      type: "error",
      data: {
        message: `Failed to spawn agent: ${err instanceof Error ? err.message : String(err)}`,
      },
    };
    appendEvent(sessionId, errorEvent);
    updateStatus(sessionId, "error");
    return;
  }

  agentHandles.set(sessionId, handle);
  setStopFn(sessionId, async () => {
    agentHandles.delete(sessionId);
    await handle.stop();
  });

  // Stream container logs to server console
  if (handle.logs) {
    streamLogs(handle.logs, sessionId);
  }

  // Send the first prompt to the agent's HTTP endpoint
  await handle.send(prompt);

  // Monitor the agent process in the background
  monitorAgent(handle, sessionId, agentId, projectId);
}

function streamLogs(
  logs: AsyncIterable<string>,
  sessionId: string,
): void {
  (async () => {
    try {
      for await (const line of logs) {
        console.log(`[agent:${sessionId.slice(0, 8)}] ${line}`);
      }
    } catch {
      // Log stream ended
    }
  })();
}

async function monitorAgent(
  handle: AgentHandle,
  sessionId: string,
  agentId: string,
  projectId: string,
): Promise<void> {
  try {
    const { exitCode } = await handle.done;

    agentHandles.delete(sessionId);

    if (getSession(sessionId)) {
      if (exitCode !== null && exitCode !== 0) {
        updateStatus(sessionId, "error");
        agentStore.updateStatus(agentId, "error");
      } else {
        updateStatus(sessionId, "completed");
        agentStore.updateStatus(agentId, "stopped");
      }

      // Extract and store memories
      const { extractMemories } = await import(
        "@cloud-agent/memory-service"
      );
      const events = getEventStore().getEvents(sessionId);
      const memories = extractMemories(sessionId, projectId, events);
      const memorySvc = getMemoryService();
      for (const memory of memories) {
        memorySvc.store(memory);
      }
    }
  } catch (err) {
    agentHandles.delete(sessionId);

    if (getSession(sessionId)) {
      const errorEvent: StoredEvent = {
        id: uuidv4(),
        sessionId,
        timestamp: new Date().toISOString(),
        type: "error",
        data: {
          message: err instanceof Error ? err.message : String(err),
        },
      };
      appendEvent(sessionId, errorEvent);
      updateStatus(sessionId, "error");
      agentStore.updateStatus(agentId, "error");
    }
  } finally {
    setStopFn(sessionId, null);
  }
}
