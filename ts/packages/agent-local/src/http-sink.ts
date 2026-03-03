import type { EventSink, AgentEvent } from "@cloud-agent/base-agent";

export class HttpEventSink implements EventSink {
  private serverUrl: string;
  private sessionId: string;
  private authToken?: string;

  constructor(serverUrl: string, sessionId: string, authToken?: string) {
    this.serverUrl = serverUrl;
    this.sessionId = sessionId;
    this.authToken = authToken;
  }

  async emit(event: AgentEvent): Promise<void> {
    const url = `${this.serverUrl}/sessions/${this.sessionId}/events`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.authToken) {
      headers["Authorization"] = `Bearer ${this.authToken}`;
    }
    const res = await fetch(url, {
      method: "POST",
      headers,
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
