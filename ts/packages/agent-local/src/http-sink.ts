import type { EventSink, AgentEvent } from "@cloud-agent/base-agent";

export class HttpEventSink implements EventSink {
  private serverUrl: string;
  private sessionId: string;

  constructor(serverUrl: string, sessionId: string) {
    this.serverUrl = serverUrl;
    this.sessionId = sessionId;
  }

  async emit(event: AgentEvent): Promise<void> {
    const url = `${this.serverUrl}/sessions/${this.sessionId}/events`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(
        `Failed to emit event (${res.status}): ${body}`,
      );
    }
  }
}
