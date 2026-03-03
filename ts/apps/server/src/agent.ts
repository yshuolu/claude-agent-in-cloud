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

/**
 * Spawn a new agent container for a session. Sets status to "starting"
 * during provisioning, then "idle" once the container is healthy.
 * Called from session creation route (fire-and-forget).
 */
export async function spawnAgent(
  sessionId: string,
  projectId: string,
): Promise<void> {
  updateStatus(sessionId, "starting");

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

  // Build/pull image if needed (Docker layer caching makes this fast on no-op)
  if (agentRunner.ensureImage) {
    try {
      await agentRunner.ensureImage();
    } catch (err) {
      const errorEvent: StoredEvent = {
        id: uuidv4(),
        sessionId,
        timestamp: new Date().toISOString(),
        type: "error",
        data: {
          message: `Failed to build agent image: ${err instanceof Error ? err.message : String(err)}`,
        },
      };
      appendEvent(sessionId, errorEvent);
      updateStatus(sessionId, "error");
      return;
    }
  }

  const serverUrl =
    process.env.SERVER_URL ??
    `http://host.docker.internal:${process.env.PORT ?? "8000"}`;

  const authToken = uuidv4();
  const agentId = uuidv4();

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

  // Persist agent record with auth token and connection URL
  agentStore.save({
    id: agentId,
    sessionId,
    status: "running",
    authToken,
    connectionUrl: handle.connectionUrl,
    createdAt: new Date().toISOString(),
    stoppedAt: null,
  });

  agentHandles.set(sessionId, handle);
  setStopFn(sessionId, async () => {
    agentHandles.delete(sessionId);
    await handle.stop();
  });

  // Stream container logs to server console
  if (handle.logs) {
    streamLogs(handle.logs, sessionId);
  }

  // Container is healthy and ready for prompts
  updateStatus(sessionId, "idle");

  // Monitor the agent process in the background
  monitorAgent(handle, sessionId, agentId, projectId);
}

/**
 * Send a prompt to an already-running agent container.
 * Returns an error string if the agent is not ready; null on success.
 */
export async function sendPrompt(
  sessionId: string,
  prompt: string,
): Promise<string | null> {
  const handle = agentHandles.get(sessionId);
  if (!handle) {
    return "No agent container running for this session";
  }

  updateStatus(sessionId, "running");
  await handle.send(prompt);
  return null;
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
