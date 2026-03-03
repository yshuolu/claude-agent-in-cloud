import { useEffect, useRef } from "react";
import type { AgentEvent } from "../hooks/useSSE";

function extractText(event: AgentEvent): string | null {
  const data = event.data;

  // Result message
  if (data.type === "result" && data.subtype === "success") {
    return data.result as string;
  }

  // Assistant message — extract text blocks
  if (data.type === "assistant" && data.message) {
    const msg = data.message as { content?: Array<{ type: string; text?: string; name?: string }> };
    if (msg.content) {
      const parts: string[] = [];
      for (const block of msg.content) {
        if (block.type === "text" && block.text) {
          parts.push(block.text);
        } else if (block.type === "tool_use") {
          parts.push(`[tool: ${block.name}]`);
        }
      }
      return parts.join("\n") || null;
    }
  }

  // Error
  if (event.type === "error") {
    return `Error: ${(data.message as string) ?? "Unknown error"}`;
  }

  return null;
}

const typeStyles: Record<string, string> = {
  system: "text-gray-500",
  assistant: "text-green-400",
  user: "text-blue-400",
  result: "text-yellow-400",
  error: "text-red-400",
};

export function EventStream({
  events,
  status,
}: {
  events: AgentEvent[];
  status: string;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events]);

  return (
    <div className="flex-1 overflow-y-auto p-4 font-mono text-sm space-y-2">
      {events.length === 0 && status === "idle" && (
        <p className="text-gray-500">Submit a task to get started.</p>
      )}
      {events.map((event) => {
        const text = extractText(event);
        if (!text) return null;
        return (
          <div key={event.id} className={typeStyles[event.type] ?? "text-gray-400"}>
            <span className="text-gray-600 text-xs mr-2">
              [{event.type}]
            </span>
            <span className="whitespace-pre-wrap">{text}</span>
          </div>
        );
      })}
      {status === "connected" && (
        <div className="text-blue-400 animate-pulse">Agent is working...</div>
      )}
      {status === "done" && (
        <div className="text-gray-500 mt-2">-- Session complete --</div>
      )}
      {status === "error" && (
        <div className="text-red-400 mt-2">-- Connection lost --</div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
