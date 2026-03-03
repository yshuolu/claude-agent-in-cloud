import { randomUUID } from "node:crypto";
import {
  runAgentSession,
  DEFAULT_SYSTEM_PROMPT,
  type McpServerConfig,
} from "@cloud-agent/base-agent";
import { HttpEventSink } from "./http-sink.js";

async function main(): Promise<void> {
  const prompt = process.env.AGENT_PROMPT;
  const model = process.env.AGENT_MODEL;
  const sessionId = process.env.AGENT_SESSION_ID ?? randomUUID();
  const serverUrl = process.env.SERVER_URL;
  const sdkSessionId = process.env.AGENT_SDK_SESSION_ID;
  const authToken = process.env.AGENT_AUTH_TOKEN;

  if (!prompt) {
    console.error("[agent] AGENT_PROMPT is required");
    process.exit(1);
  }

  if (!serverUrl) {
    console.error("[agent] SERVER_URL is required");
    process.exit(1);
  }

  const sink = new HttpEventSink(serverUrl, sessionId, authToken);

  // Build MCP server list — all MCPs inherit AGENT_AUTH_TOKEN + SERVER_URL from env
  const mcpServers: McpServerConfig[] = [
    {
      name: "project-management",
      command: "mcp-project-management",
    },
  ];

  try {
    await runAgentSession({
      sessionId,
      prompt,
      model,
      sink,
      sdkSessionId,
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
      mcpServers,
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
