import { spawn as cpSpawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { AgentRunner, AgentHandle, SpawnOptions } from "./types.js";

async function* readLines(
  stream: NodeJS.ReadableStream,
): AsyncIterable<string> {
  let buffer = "";
  for await (const chunk of stream) {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop()!;
    for (const line of lines) {
      if (line.trim()) yield line;
    }
  }
  if (buffer.trim()) yield buffer;
}

export class SubprocessRunner implements AgentRunner {
  private agentScriptPath: string;

  constructor(agentScriptPath: string) {
    this.agentScriptPath = agentScriptPath;
  }

  async spawn(options: SpawnOptions): Promise<AgentHandle> {
    const id = randomUUID();

    const env: Record<string, string | undefined> = {
      ...process.env,
      AGENT_SESSION_ID: options.sessionId,
      AGENT_PROMPT: options.prompt,
      AGENT_MODEL: options.model ?? "claude-sonnet-4-5-20250929",
      ANTHROPIC_API_KEY: options.apiKey,
    };

    if (options.serverUrl) {
      env.SERVER_URL = options.serverUrl;
    }
    if (options.sdkSessionId) {
      env.AGENT_SDK_SESSION_ID = options.sdkSessionId;
    }

    const child = cpSpawn(
      "node",
      [this.agentScriptPath],
      {
        env,
        cwd: options.workDir ?? process.cwd(),
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    const done = new Promise<{ exitCode: number | null }>((resolve) => {
      child.on("exit", (code) => resolve({ exitCode: code }));
      child.on("error", () => resolve({ exitCode: 1 }));
    });

    return {
      id,
      sessionId: options.sessionId,
      logs: readLines(child.stdout!),
      async stop() {
        child.kill("SIGTERM");
        const timeout = setTimeout(() => child.kill("SIGKILL"), 10_000);
        await done;
        clearTimeout(timeout);
      },
      done,
    };
  }
}
