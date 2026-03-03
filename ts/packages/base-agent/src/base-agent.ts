import { randomUUID } from "node:crypto";
import type { AgentEvent, EventSink } from "./types.js";

export interface RunSessionOptions {
  sessionId: string;
  prompts: AsyncIterable<string>;
  model?: string;
  sink: EventSink;
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
  const { sessionId, prompts, sink } = opts;
  const model = opts.model ?? "claude-sonnet-4-5-20250929";

  const sdk = await import("@anthropic-ai/claude-agent-sdk");

  await emitEvent(sink, sessionId, "system", {
    message: "Session started",
  });

  let sdkSessionId: string | undefined;

  const baseOptions = {
    model,
    cwd: process.cwd(),
    settingSources: ["user", "project"],
    allowedTools: [
      "Skill", "Bash", "Read", "Edit", "Write", "Glob", "Grep",
      "mcp__project-management__create_task",
      "mcp__project-management__list_tasks",
      "mcp__project-management__get_task",
      "mcp__project-management__update_task",
      "mcp__project-management__delete_task",
    ],
    permissionMode: "bypassPermissions",
    allowDangerouslySkipPermissions: true,
    maxTurns: 50,
    debug: true,
    stderr: (data: string) => {
      console.error(`[agent:stderr] ${data.trimEnd()}`);
    },
  } as Record<string, unknown>;

  for await (const prompt of prompts) {
    await emitEvent(sink, sessionId, "user", { message: prompt });

    const options = sdkSessionId
      ? { ...baseOptions, resume: sdkSessionId }
      : baseOptions;

    const query = sdk.query({
      prompt,
      options,
    });

    for await (const message of query) {
      const msgData = message as Record<string, unknown>;

      if (msgData.session_id) {
        sdkSessionId = msgData.session_id as string;
      }

      // Log SDK init message for debugging
      if (msgData.type === "system" && msgData.subtype === "init") {
        console.log(`[agent] SDK init: cwd=${msgData.cwd}`);
        console.log(`[agent] SDK init: skills=${JSON.stringify(msgData.skills)}`);
        console.log(`[agent] SDK init: mcp_servers=${JSON.stringify(msgData.mcp_servers)}`);
        console.log(
          `[agent] SDK init: tools=${JSON.stringify((msgData.tools as string[])?.filter((t) => t.startsWith("mcp") || t === "Skill"))}`,
        );
        console.log(
          `[agent] SDK init: CLAUDE_CONFIG_DIR=${process.env.CLAUDE_CONFIG_DIR}, HOME=${process.env.HOME}`,
        );
      }

      await emitEvent(sink, sessionId, (msgData.type as string) ?? "assistant", {
        ...(sdkSessionId ? { sdkSessionId } : {}),
        ...msgData,
      });
    }

    query.close();

    await emitEvent(sink, sessionId, "turn_complete", {
      message: "Turn complete",
      ...(sdkSessionId ? { sdkSessionId } : {}),
    });
  }

  await emitEvent(sink, sessionId, "system", {
    message: "Session completed",
    ...(sdkSessionId ? { sdkSessionId } : {}),
  });
}
