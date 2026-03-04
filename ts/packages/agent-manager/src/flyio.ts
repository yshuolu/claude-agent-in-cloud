import { randomUUID } from "node:crypto";
import type { AgentRunner, AgentHandle, SpawnOptions } from "./types.js";

interface FlyRunnerConfig {
  apiToken: string;
  appName: string;
  agentImage: string;
  region?: string;
}

interface FlyMachineResponse {
  id: string;
  state: string;
}

export class FlyRunner implements AgentRunner {
  private config: FlyRunnerConfig;
  private baseUrl: string;

  constructor(config: FlyRunnerConfig) {
    this.config = config;
    this.baseUrl = `https://api.machines.dev/v1/apps/${config.appName}/machines`;
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.config.apiToken}`,
      "Content-Type": "application/json",
    };
  }

  async spawn(options: SpawnOptions): Promise<AgentHandle> {
    const id = randomUUID();

    const res = await fetch(this.baseUrl, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        config: {
          image: this.config.agentImage,
          env: {
            AGENT_SESSION_ID: options.sessionId,
            AGENT_MODEL: options.model ?? "claude-sonnet-4-5-20250929",
            ANTHROPIC_API_KEY: options.apiKey,
            ...(options.serverUrl
              ? { SERVER_URL: options.serverUrl }
              : {}),
            ...(options.authToken
              ? { AGENT_AUTH_TOKEN: options.authToken }
              : {}),
            ...(options.extraEnv ?? {}),
          },
          auto_destroy: true,
          restart: { policy: "no" },
        },
        region: this.config.region ?? "iad",
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Fly machine create failed (${res.status}): ${body}`);
    }

    const machine = (await res.json()) as FlyMachineResponse;
    const machineId = machine.id;

    // Wait for the machine to enter "started" state
    await this.waitForState(machineId, "started");

    const connectionUrl = `https://${machineId}.fly.dev`;

    const logs = this.streamLogs(machineId);

    const done = this.pollUntilStopped(machineId);

    return {
      id,
      sessionId: options.sessionId,
      connectionUrl,
      logs,
      async send() {
        throw new Error("FlyRunner does not support multi-turn send()");
      },
      stop: () => this.stopMachine(machineId),
      done,
    };
  }

  private async waitForState(
    machineId: string,
    targetState: string,
    timeoutMs = 30_000,
  ): Promise<void> {
    const url = `${this.baseUrl}/${machineId}/wait?state=${targetState}&timeout=${timeoutMs / 1000}`;
    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(
        `Fly machine wait failed (${res.status}): ${body}`,
      );
    }
  }

  private async *streamLogs(machineId: string): AsyncIterable<string> {
    const url = `${this.baseUrl}/${machineId}/logs?follow=true`;
    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) return;
    if (!res.body) return;

    let buffer = "";
    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop()!;

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const log = JSON.parse(line);
            if (log.message) yield log.message;
          } catch {
            yield line;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
    if (buffer.trim()) yield buffer;
  }

  private async pollUntilStopped(
    machineId: string,
  ): Promise<{ exitCode: number | null }> {
    try {
      // Use the wait endpoint for "stopped" state with a long timeout
      await this.waitForState(machineId, "stopped", 600_000);
      // Get final machine state for exit code
      const res = await fetch(`${this.baseUrl}/${machineId}`, {
        headers: this.headers(),
      });
      if (res.ok) {
        const data = (await res.json()) as Record<string, unknown>;
        const events = data.events as Array<{ status?: { exit_code?: number } }> | undefined;
        return {
          exitCode: events?.[0]?.status?.exit_code ?? 0,
        };
      }
      return { exitCode: 0 };
    } catch {
      return { exitCode: 1 };
    }
  }

  private async stopMachine(machineId: string): Promise<void> {
    try {
      await fetch(`${this.baseUrl}/${machineId}/stop`, {
        method: "POST",
        headers: this.headers(),
      });
    } catch {
      // Machine may already be stopped
    }
  }
}
