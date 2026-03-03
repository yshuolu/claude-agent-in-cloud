import { randomUUID } from "node:crypto";
import type { AgentEvent, EventSink } from "./types.js";

export interface RunSessionOptions {
  sessionId: string;
  prompt: string;
  model?: string;
  sink: EventSink;
  sdkSessionId?: string;
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
  const { sessionId, prompt, sink, sdkSessionId } = opts;
  const model = opts.model ?? "claude-sonnet-4-5-20250929";

  const sdk = await import("@anthropic-ai/claude-agent-sdk");

  const sessionOpts = { model };

  let session;
  if (sdkSessionId) {
    session = sdk.unstable_v2_resumeSession(sdkSessionId, sessionOpts);
    await emitEvent(sink, sessionId, "system", {
      message: "Resumed existing session",
      sdkSessionId,
    });
  } else {
    session = sdk.unstable_v2_createSession(sessionOpts);
    await emitEvent(sink, sessionId, "system", {
      message: "Session started",
    });
  }

  await session.send(prompt);

  for await (const message of session.stream()) {
    const msgData =
      typeof message === "object" && message !== null
        ? (message as Record<string, unknown>)
        : { value: message };

    await emitEvent(
      sink,
      sessionId,
      (msgData.type as string) ?? "assistant",
      {
        sdkSessionId: session.sessionId,
        ...msgData,
      },
    );
  }

  await emitEvent(sink, sessionId, "system", {
    message: "Session completed",
    sdkSessionId: session.sessionId,
  });
}
