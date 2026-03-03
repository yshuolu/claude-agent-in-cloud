import type { MemoryService, MemoryEntry } from "./types.js";

export class InMemoryMemoryService implements MemoryService {
  private byProject = new Map<string, MemoryEntry[]>();
  private bySession = new Map<string, MemoryEntry[]>();

  store(entry: MemoryEntry): void {
    let projectList = this.byProject.get(entry.projectId);
    if (!projectList) {
      projectList = [];
      this.byProject.set(entry.projectId, projectList);
    }
    projectList.push(entry);

    let sessionList = this.bySession.get(entry.sessionId);
    if (!sessionList) {
      sessionList = [];
      this.bySession.set(entry.sessionId, sessionList);
    }
    sessionList.push(entry);
  }

  retrieve(
    projectId: string,
    options?: { tags?: string[]; limit?: number },
  ): MemoryEntry[] {
    const limit = options?.limit ?? 50;
    let entries = this.byProject.get(projectId) ?? [];

    if (options?.tags?.length) {
      entries = entries.filter((e) =>
        e.tags.some((t) => options.tags!.includes(t)),
      );
    }

    // Most recent first
    return entries.slice().reverse().slice(0, limit);
  }

  getSessionMemories(sessionId: string): MemoryEntry[] {
    return this.bySession.get(sessionId) ?? [];
  }

  close(): void {
    this.byProject.clear();
    this.bySession.clear();
  }
}
