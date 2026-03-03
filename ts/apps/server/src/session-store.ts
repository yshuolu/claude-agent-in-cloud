import type { Session, SessionStatus } from "@cloud-agent/shared";
import type { EventStore, StoredEvent } from "@cloud-agent/event-store";
import type { MemoryService } from "@cloud-agent/memory-service";

export interface SessionEntry {
  session: Session;
  projectId: string;
  stopAgent: (() => Promise<void>) | null;
}

let eventStore: EventStore;
let memoryService: MemoryService;
const sessions = new Map<string, SessionEntry>();

export function initStore(store: EventStore): void {
  eventStore = store;
}

export function initMemory(service: MemoryService): void {
  memoryService = service;
}

export function getEventStore(): EventStore {
  return eventStore;
}

export function getMemoryService(): MemoryService {
  return memoryService;
}

export function createSession(id: string, projectId = "default"): Session {
  const now = new Date().toISOString();
  const session: Session = {
    id,
    status: "idle",
    createdAt: now,
    updatedAt: now,
  };
  sessions.set(id, {
    session,
    projectId,
    stopAgent: null,
  });
  return session;
}

export function getSession(id: string): SessionEntry | undefined {
  return sessions.get(id);
}

export function updateStatus(id: string, status: SessionStatus): void {
  const entry = sessions.get(id);
  if (entry) {
    entry.session.status = status;
    entry.session.updatedAt = new Date().toISOString();
  }
}

export function appendEvent(id: string, event: StoredEvent): void {
  eventStore.append(event);
}

export function setStopFn(
  id: string,
  fn: (() => Promise<void>) | null,
): void {
  const entry = sessions.get(id);
  if (entry) {
    entry.stopAgent = fn;
  }
}

export async function deleteSession(id: string): Promise<boolean> {
  const entry = sessions.get(id);
  if (!entry) return false;
  if (entry.stopAgent) {
    await entry.stopAgent();
  }
  sessions.delete(id);
  return true;
}

export function listSessions(): Session[] {
  return Array.from(sessions.values()).map((e) => e.session);
}
