import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { runAgentSession } from "@cloud-agent/base-agent";
import { HttpEventSink } from "./http-sink.js";

const AGENT_PORT = parseInt(process.env.AGENT_PORT ?? "9100", 10);

async function main(): Promise<void> {
  const model = process.env.AGENT_MODEL;
  const sessionId = process.env.AGENT_SESSION_ID ?? randomUUID();
  const serverUrl = process.env.SERVER_URL;
  const authToken = process.env.AGENT_AUTH_TOKEN;

  if (!serverUrl) {
    console.error("[agent] SERVER_URL is required");
    process.exit(1);
  }

  const sink = new HttpEventSink(serverUrl, sessionId, authToken);

  // Prompt queue — HTTP handler pushes, session loop consumes
  const promptQueue: string[] = [];
  let resolveWait: (() => void) | null = null;

  async function* prompts(): AsyncIterable<string> {
    while (true) {
      while (promptQueue.length > 0) {
        yield promptQueue.shift()!;
      }
      // Wait for the next prompt to arrive
      await new Promise<void>((resolve) => {
        resolveWait = resolve;
      });
      resolveWait = null;
    }
  }

  function enqueuePrompt(prompt: string): void {
    promptQueue.push(prompt);
    if (resolveWait) resolveWait();
  }

  // HTTP server to receive prompts
  const server = createServer((req, res) => {
    if (req.method === "POST" && req.url === "/message") {
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", () => {
        try {
          const parsed = JSON.parse(body) as { prompt?: string };
          if (!parsed.prompt) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "prompt is required" }));
            return;
          }
          enqueuePrompt(parsed.prompt);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        } catch {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "invalid JSON" }));
        }
      });
    } else if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  server.listen(AGENT_PORT, () => {
    console.log(`[agent] listening on port ${AGENT_PORT}`);
  });

  try {
    await runAgentSession({
      sessionId,
      prompts: prompts(),
      model,
      sink,
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
  } finally {
    server.close();
  }
}

main();
