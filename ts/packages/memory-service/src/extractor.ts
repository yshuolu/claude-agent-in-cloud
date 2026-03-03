import { randomUUID } from "node:crypto";
import type { MemoryEntry } from "./types.js";

interface AgentEvent {
  type: string;
  data: Record<string, unknown>;
}

/**
 * Extract memory entries from a completed agent session's events.
 * Pulls key facts from result messages and significant assistant outputs.
 */
export function extractMemories(
  sessionId: string,
  projectId: string,
  events: AgentEvent[],
): MemoryEntry[] {
  const memories: MemoryEntry[] = [];
  const now = new Date().toISOString();

  for (const event of events) {
    const data = event.data;

    // Extract from result messages
    if (data.type === "result" && data.subtype === "success" && data.result) {
      const result = data.result as string;
      if (result.length > 10) {
        memories.push({
          id: randomUUID(),
          sessionId,
          projectId,
          content: result.slice(0, 2000),
          createdAt: now,
          tags: ["result", "summary"],
        });
      }
    }

    // Extract from assistant text that mentions files or decisions
    if (data.type === "assistant" && data.message) {
      const msg = data.message as {
        content?: Array<{ type: string; text?: string; name?: string; input?: Record<string, unknown> }>;
      };
      if (msg.content) {
        for (const block of msg.content) {
          if (block.type === "tool_use" && block.name) {
            // Record tool usage patterns
            const input = block.input ?? {};
            if (block.name === "Write" || block.name === "Edit") {
              const filePath = (input.file_path as string) ?? "";
              if (filePath) {
                memories.push({
                  id: randomUUID(),
                  sessionId,
                  projectId,
                  content: `Modified file: ${filePath}`,
                  createdAt: now,
                  tags: ["file-change", block.name.toLowerCase()],
                });
              }
            }
          }
        }
      }
    }
  }

  return memories;
}
