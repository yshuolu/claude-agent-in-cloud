import { randomUUID } from "node:crypto";
import type { AgentEvent, EventSink, McpServerConfig } from "./types.js";

export interface RunSessionOptions {
  sessionId: string;
  prompt: string;
  model?: string;
  sink: EventSink;
  sdkSessionId?: string;
  systemPrompt?: string;
  mcpServers?: McpServerConfig[];
}

async function emitEvent(
  sink: EventSink,
  sessionId: string,
  type: string,
  data: Record<string, unknown>,
): Promise<AgentEvent> {
  const event: AgentEvent = {
    id: randomUUID(),
    sessionId,
    timestamp: new Date().toISOString(),
    type,
    data,
  };
  await sink.emit(event);
  console.log(`[agent] event: ${type} (${event.id})`);
  return event;
}

export async function runAgentSession(
  opts: RunSessionOptions,
): Promise<void> {
  const { sessionId, prompt, sink, sdkSessionId, systemPrompt, mcpServers } =
    opts;
  const model = opts.model ?? "claude-sonnet-4-5-20250929";

  const sdk = await import("@anthropic-ai/claude-agent-sdk");

  // Build SDK mcpServers config
  const sdkMcpServers: Record<string, { command: string; args?: string[] }> = {};
  if (mcpServers && mcpServers.length > 0) {
    for (const mcp of mcpServers) {
      sdkMcpServers[mcp.name] = {
        command: mcp.command,
        ...(mcp.args ? { args: mcp.args } : {}),
      };
    }
  }

  // Use the v1 query API which supports systemPrompt and mcpServers
  const query = sdk.query({
    prompt,
    options: {
      model,
      ...(sdkSessionId ? { resume: sdkSessionId } : {}),
      ...(systemPrompt ? { systemPrompt } : {}),
      ...(Object.keys(sdkMcpServers).length > 0
        ? { mcpServers: sdkMcpServers }
        : {}),
    },
  });

  await emitEvent(sink, sessionId, "system", {
    message: sdkSessionId ? "Resumed existing session" : "Session started",
    ...(sdkSessionId ? { sdkSessionId } : {}),
  });

  let resultSessionId: string | undefined;

  for await (const message of query) {
    const msgData =
      typeof message === "object" && message !== null
        ? (message as Record<string, unknown>)
        : { value: message };

    if (msgData.sessionId) {
      resultSessionId = msgData.sessionId as string;
    }

    await emitEvent(
      sink,
      sessionId,
      (msgData.type as string) ?? "assistant",
      {
        ...(resultSessionId ? { sdkSessionId: resultSessionId } : {}),
        ...msgData,
      },
    );
  }

  await emitEvent(sink, sessionId, "system", {
    message: "Session completed",
    ...(resultSessionId ? { sdkSessionId: resultSessionId } : {}),
  });
}
