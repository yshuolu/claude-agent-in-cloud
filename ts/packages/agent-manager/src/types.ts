export interface AgentHandle {
  /** Unique ID for this agent run */
  id: string;
  /** Session this agent belongs to */
  sessionId: string;
  /** Diagnostic logs from agent process (NOT event data) */
  logs?: AsyncIterable<string>;
  /** Stop the agent gracefully, then force kill after timeout */
  stop(): Promise<void>;
  /** Promise that resolves when the agent exits */
  done: Promise<{ exitCode: number | null }>;
}

export interface SpawnOptions {
  sessionId: string;
  prompt: string;
  model?: string;
  apiKey: string;
  workDir?: string;
  /** Server URL for agent to POST events to */
  serverUrl?: string;
  /** SDK session ID for resuming a prior session */
  sdkSessionId?: string;
}

export interface AgentRunner {
  /** Spawn a new agent process */
  spawn(options: SpawnOptions): Promise<AgentHandle>;
}
