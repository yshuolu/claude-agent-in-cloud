import { randomUUID } from "node:crypto";
import { runAgentSession } from "@cloud-agent/base-agent";
import { HttpEventSink } from "./http-sink.js";

async function main(): Promise<void> {
  const prompt = process.env.AGENT_PROMPT;
  const model = process.env.AGENT_MODEL;
  const sessionId = process.env.AGENT_SESSION_ID ?? randomUUID();
  const serverUrl = process.env.SERVER_URL;
  const sdkSessionId = process.env.AGENT_SDK_SESSION_ID;

  if (!prompt) {
    console.error("[agent] AGENT_PROMPT is required");
    process.exit(1);
  }

  if (!serverUrl) {
    console.error("[agent] SERVER_URL is required");
    process.exit(1);
  }

  const sink = new HttpEventSink(serverUrl, sessionId);

  try {
    await runAgentSession({
      sessionId,
      prompt,
      model,
      sink,
      sdkSessionId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[agent] Fatal error: ${message}`);
    try {
      await sink.emit({
        id: randomUUID(),
        sessionId,
        timestamp: new Date().toISOString(),
        type: "error",
        data: { message },
      });
    } catch {
      // Best-effort error reporting
    }
    process.exit(1);
  }
}

main();
