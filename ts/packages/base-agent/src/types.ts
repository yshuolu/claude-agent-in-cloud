export interface AgentEvent {
  id: string;
  sessionId: string;
  timestamp: string;
  type: string;
  data: Record<string, unknown>;
}

export interface EventSink {
  emit(event: AgentEvent): Promise<void>;
}
