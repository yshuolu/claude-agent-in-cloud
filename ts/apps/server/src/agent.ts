import { v4 as uuidv4 } from "uuid";
import type { StoredEvent } from "@cloud-agent/event-store";
import type { AgentRunner, AgentStore } from "@cloud-agent/agent-manager";
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
  resume?: boolean;
}

export async function runAgent(options: RunAgentOptions): Promise<void> {
  const { sessionId, prompt, projectId, resume } = options;
  updateStatus(sessionId, "running");

  // Build prompt with memory context if resuming
  let fullPrompt = prompt;
  const memorySvc = getMemoryService();
  if (resume) {
    const memories = memorySvc.retrieve(projectId, { limit: 20 });
    if (memories.length > 0) {
      const memoryContext = memories
        .map((m) => `- ${m.content}`)
        .join("\n");
      fullPrompt = `## Context from previous sessions\n${memoryContext}\n\n${prompt}`;
    }
  }

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

  const serverUrl =
    process.env.SERVER_URL ??
    `http://localhost:${process.env.PORT ?? "8000"}`;

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

  let handle;
  try {
    handle = await agentRunner.spawn({
      sessionId,
      prompt: fullPrompt,
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

  setStopFn(sessionId, () => handle.stop());

  try {
    // Agent writes events via HTTP POST to this server.
    // We just wait for the process to finish.
    const { exitCode } = await handle.done;

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
      for (const memory of memories) {
        memorySvc.store(memory);
      }
    }
  } catch (err) {
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
