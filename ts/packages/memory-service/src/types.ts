export interface MemoryEntry {
  id: string;
  /** Session that produced this memory */
  sessionId: string;
  /** Project scope — memories with the same projectId are shared across sessions */
  projectId: string;
  /** The extracted fact or context */
  content: string;
  /** When this memory was created */
  createdAt: string;
  /** Relevance tags for retrieval */
  tags: string[];
}

export interface MemoryService {
  /** Store a new memory entry */
  store(entry: MemoryEntry): void;

  /** Retrieve memories for a project, optionally filtered by tags */
  retrieve(projectId: string, options?: { tags?: string[]; limit?: number }): MemoryEntry[];

  /** Retrieve memories from a specific session */
  getSessionMemories(sessionId: string): MemoryEntry[];

  /** Close the service and release resources */
  close(): void;
}
