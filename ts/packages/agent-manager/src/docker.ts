import Docker from "dockerode";
import { randomUUID } from "node:crypto";
import type { AgentRunner, AgentHandle, SpawnOptions } from "./types.js";

const AGENT_PORT = 9100;

export interface DockerBuildOptions {
  dockerfile: string;  // path relative to context, e.g. "docker/Dockerfile.agent"
  context: string;     // absolute path to build context (project root)
}

export class DockerRunner implements AgentRunner {
  private docker: Docker;
  private imageName: string;
  private buildOptions: DockerBuildOptions | null;

  constructor(
    imageName = "cloud-agent-runner",
    socketPath?: string,
    buildOptions?: DockerBuildOptions,
  ) {
    this.docker = new Docker(
      socketPath ? { socketPath } : undefined,
    );
    this.imageName = imageName;
    this.buildOptions = buildOptions ?? null;
  }

  /**
   * Build/pull the agent Docker image. Called per-session via ensureImage().
   * Docker layer caching handles skipping rebuilds when files haven't changed.
   */
  async ensureImage(): Promise<void> {
    if (!this.buildOptions) return;
    await this.buildImage(this.buildOptions);
  }

  async buildImage(opts: DockerBuildOptions): Promise<void> {
    const { execSync } = await import("node:child_process");
    console.log(`[docker] Building image "${this.imageName}" ...`);
    try {
      execSync(
        `docker build -f ${opts.dockerfile} -t ${this.imageName} .`,
        {
          cwd: opts.context,
          stdio: "inherit",
        },
      );
      console.log(`[docker] Image "${this.imageName}" ready`);
    } catch (err) {
      throw new Error(
        `Failed to build Docker image: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async spawn(options: SpawnOptions): Promise<AgentHandle> {
    const id = randomUUID();

    const env = [
      `AGENT_SESSION_ID=${options.sessionId}`,
      `AGENT_MODEL=${options.model ?? "claude-sonnet-4-5-20250929"}`,
      `ANTHROPIC_API_KEY=${options.apiKey}`,
      `AGENT_PORT=${AGENT_PORT}`,
    ];

    if (options.serverUrl) {
      env.push(`SERVER_URL=${options.serverUrl}`);
    }
    if (options.authToken) {
      env.push(`AGENT_AUTH_TOKEN=${options.authToken}`);
    }

    const container = await this.docker.createContainer({
      Image: this.imageName,
      Env: env,
      ExposedPorts: { [`${AGENT_PORT}/tcp`]: {} },
      HostConfig: {
        AutoRemove: true,
        PublishAllPorts: true,
      },
      Labels: {
        "cloud-agent.session": options.sessionId,
        "cloud-agent.agent": id,
      },
    });

    await container.start();

    // Get the mapped host port
    const containerInfo = await container.inspect();
    const portBindings = containerInfo.NetworkSettings.Ports[`${AGENT_PORT}/tcp`];
    if (!portBindings || portBindings.length === 0) {
      throw new Error("Failed to get mapped port for agent container");
    }
    const hostPort = portBindings[0].HostPort;
    const agentUrl = `http://127.0.0.1:${hostPort}`;

    // Wait for agent HTTP server to be ready
    try {
      await waitForHealth(agentUrl);
    } catch (err) {
      // Dump container logs and status for debugging
      console.error(`[docker] Health check failed for container ${container.id}`);
      try {
        const info = await container.inspect();
        console.error(`[docker] Container state: ${JSON.stringify(info.State)}`);
        const logs = await container.logs({ stdout: true, stderr: true, tail: 50 });
        const logText = logs instanceof Buffer ? logs.toString() : String(logs);
        console.error(`[docker] Container logs:\n${logText}`);
      } catch {
        // Best-effort logging
      }
      throw err;
    }

    const logStream = await container.logs({
      follow: true,
      stdout: true,
      stderr: true,
    });

    const done = new Promise<{ exitCode: number | null }>((resolve) => {
      container
        .wait()
        .then((result) => resolve({ exitCode: result.StatusCode }))
        .catch(() => resolve({ exitCode: 1 }));
    });

    return {
      id,
      sessionId: options.sessionId,
      connectionUrl: agentUrl,
      logs: readLines(logStream),
      async send(prompt: string) {
        const res = await fetch(`${agentUrl}/message`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt }),
        });
        if (!res.ok) {
          const body = await res.text();
          throw new Error(`Agent send failed (${res.status}): ${body}`);
        }
      },
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

async function waitForHealth(
  agentUrl: string,
  timeoutMs = 30_000,
  intervalMs = 500,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${agentUrl}/health`);
      if (res.ok) return;
    } catch {
      // Not ready yet
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("Agent health check timed out");
}

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
