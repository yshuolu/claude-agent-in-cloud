export interface AgentHandle {
  /** Unique ID for this agent run */
  id: string;
  /** Session this agent belongs to */
  sessionId: string;
  /** Diagnostic logs from agent process (NOT event data) */
  logs?: AsyncIterable<string>;
  /** Send a follow-up prompt to the running agent */
  send(prompt: string): Promise<void>;
  /** Stop the agent gracefully, then force kill after timeout */
  stop(): Promise<void>;
  /** URL to reach the agent (e.g. http://127.0.0.1:54321 for Docker) */
  connectionUrl: string;
  /** Promise that resolves when the agent exits */
  done: Promise<{ exitCode: number | null }>;
}

export interface SpawnOptions {
  sessionId: string;
  model?: string;
  apiKey: string;
  workDir?: string;
  /** Server URL for agent to POST events to */
  serverUrl?: string;
  /** Auth token for agent to authenticate with the server */
  authToken?: string;
}

export interface AgentRecord {
  id: string;
  sessionId: string;
  status: "running" | "stopped" | "error";
  authToken: string;
  createdAt: string;
  connectionUrl: string;
  stoppedAt: string | null;
}

export interface AgentStore {
  save(record: AgentRecord): void;
  get(id: string): AgentRecord | null;
  getByToken(token: string): AgentRecord | null;
  updateStatus(id: string, status: AgentRecord["status"]): void;
  listBySession(sessionId: string): AgentRecord[];
  close(): void;
}

export interface AgentRunner {
  /** Build/pull image if needed (Docker rebuilds, Fly.io is a no-op) */
  ensureImage?(): Promise<void>;
  /** Spawn a new agent process */
  spawn(options: SpawnOptions): Promise<AgentHandle>;
}
