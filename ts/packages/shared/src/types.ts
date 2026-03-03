export type SessionStatus = "starting" | "idle" | "running" | "completed" | "error";

export interface Session {
  id: string;
  status: SessionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface TaskRequest {
  prompt: string;
}

export interface AgentEvent {
  id: string;
  sessionId: string;
  timestamp: string;
  type: "system" | "assistant" | "user" | "result" | "error";
  data: Record<string, unknown>;
}
