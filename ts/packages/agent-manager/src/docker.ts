import Docker from "dockerode";
import { randomUUID } from "node:crypto";
import type { AgentRunner, AgentHandle, SpawnOptions } from "./types.js";

export class DockerRunner implements AgentRunner {
  private docker: Docker;
  private imageName: string;

  constructor(
    imageName = "cloud-agent-runner",
    socketPath?: string,
  ) {
    this.docker = new Docker(
      socketPath ? { socketPath } : undefined,
    );
    this.imageName = imageName;
  }

  async spawn(options: SpawnOptions): Promise<AgentHandle> {
    const id = randomUUID();

    const env = [
      `AGENT_SESSION_ID=${options.sessionId}`,
      `AGENT_PROMPT=${options.prompt}`,
      `AGENT_MODEL=${options.model ?? "claude-sonnet-4-5-20250929"}`,
      `ANTHROPIC_API_KEY=${options.apiKey}`,
    ];

    if (options.serverUrl) {
      env.push(`SERVER_URL=${options.serverUrl}`);
    }
    if (options.sdkSessionId) {
      env.push(`AGENT_SDK_SESSION_ID=${options.sdkSessionId}`);
    }

    const hostConfig: Docker.HostConfig = {
      AutoRemove: true,
    };

    const container = await this.docker.createContainer({
      Image: this.imageName,
      Env: env,
      HostConfig: hostConfig,
      Labels: {
        "cloud-agent.session": options.sessionId,
        "cloud-agent.agent": id,
      },
    });

    await container.start();

    const logStream = await container.logs({
      follow: true,
      stdout: true,
      stderr: true,
    });

    async function* readLines(
      stream: NodeJS.ReadableStream,
    ): AsyncIterable<string> {
      let buffer = "";
      for await (const chunk of stream) {
        // Docker multiplexed stream: skip 8-byte header per frame
        const raw = chunk instanceof Buffer ? chunk : Buffer.from(chunk);
        let offset = 0;
        while (offset < raw.length) {
          if (offset + 8 > raw.length) break;
          const size = raw.readUInt32BE(offset + 4);
          offset += 8;
          if (offset + size > raw.length) break;
          buffer += raw.subarray(offset, offset + size).toString();
          offset += size;
        }
        const lines = buffer.split("\n");
        buffer = lines.pop()!;
        for (const line of lines) {
          if (line.trim()) yield line;
        }
      }
      if (buffer.trim()) yield buffer;
    }

    const done = new Promise<{ exitCode: number | null }>((resolve) => {
      container
        .wait()
        .then((result) => resolve({ exitCode: result.StatusCode }))
        .catch(() => resolve({ exitCode: 1 }));
    });

    return {
      id,
      sessionId: options.sessionId,
      logs: readLines(logStream),
      async stop() {
        try {
          await container.stop({ t: 10 });
        } catch {
          // Container may already be stopped
        }
      },
      done,
    };
  }
}
