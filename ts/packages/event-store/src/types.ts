export interface StoredEvent {
  id: string;
  sessionId: string;
  timestamp: string;
  type: string;
  data: Record<string, unknown>;
}

export type EventCallback = (event: StoredEvent) => void;

export interface GetEventsOptions {
  afterId?: string;
  offset?: number;
  limit?: number;
}

export interface EventStore {
  /** Append an event to the store */
  append(event: StoredEvent): void;

  /**
   * Get events for a session.
   * Second param can be an afterId string (backward compat) or GetEventsOptions.
   */
  getEvents(
    sessionId: string,
    options?: string | GetEventsOptions,
  ): StoredEvent[];

  /** Subscribe to new events for a session. Returns an unsubscribe function. */
  subscribe(sessionId: string, callback: EventCallback): () => void;

  /** Close the store and release resources */
  close(): void;
}
