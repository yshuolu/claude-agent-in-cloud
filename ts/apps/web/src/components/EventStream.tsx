import { useState, useEffect, useRef } from "react";
import type { AgentEvent } from "../hooks/useSSE";

interface ContentBlock {
  type: string;
  text?: string;
  thinking?: string;
  name?: string;
  id?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: unknown;
  is_error?: boolean;
}

/** Pair a tool_use block with its matching tool_result (if found in subsequent events). */
function findToolResult(
  toolUseId: string,
  events: AgentEvent[],
  startIdx: number,
): ContentBlock | null {
  for (let i = startIdx + 1; i < events.length; i++) {
    const data = events[i].data;

    // Tool results in assistant messages
    if (data.type === "assistant" && data.message) {
      const msg = data.message as { content?: ContentBlock[] };
      if (msg.content) {
        for (const block of msg.content) {
          if (block.type === "tool_result" && block.tool_use_id === toolUseId) {
            return block;
          }
        }
      }
    }

    // Tool results in user messages (SDK sends tool results as UserMessage)
    if (data.type === "user" && data.content) {
      const content = data.content as ContentBlock[];
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === "tool_result" && block.tool_use_id === toolUseId) {
            return block;
          }
        }
      }
    }
  }
  return null;
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + "…" : text;
}

function formatInput(input: unknown): string {
  if (input == null) return "";
  if (typeof input === "string") return input;
  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return String(input);
  }
}

function formatOutput(content: unknown): string {
  if (content == null) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => {
        if (typeof c === "string") return c;
        if (c && typeof c === "object" && "text" in c) return c.text;
        return JSON.stringify(c);
      })
      .join("\n");
  }
  try {
    return JSON.stringify(content, null, 2);
  } catch {
    return String(content);
  }
}

function ToolCall({
  block,
  result,
}: {
  block: ContentBlock;
  result: ContentBlock | null;
}) {
  const [open, setOpen] = useState(false);
  const isError = result?.is_error ?? false;
  const isPending = result === null;

  const statusIcon = isPending ? "⟳" : isError ? "✗" : "✓";
  const statusColor = isPending
    ? "text-yellow-500"
    : isError
      ? "text-red-400"
      : "text-green-400";

  return (
    <div className="border border-gray-700 rounded my-1">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-gray-800 cursor-pointer"
      >
        <span className="text-gray-500 text-xs">{open ? "▼" : "▶"}</span>
        <span className={`${statusColor} text-xs font-bold`}>{statusIcon}</span>
        <span className="text-purple-400 text-xs font-medium">
          {block.name}
        </span>
        {!open && (
          <span className="text-gray-600 text-xs truncate flex-1">
            {truncate(formatInput(block.input), 80)}
          </span>
        )}
      </button>
      {open && (
        <div className="border-t border-gray-700 text-xs">
          <div className="px-3 py-2 bg-gray-800/50">
            <div className="text-gray-500 mb-1">Input:</div>
            <pre className="text-gray-300 whitespace-pre-wrap break-all max-h-60 overflow-y-auto">
              {formatInput(block.input)}
            </pre>
          </div>
          {result && (
            <div className="px-3 py-2 border-t border-gray-700">
              <div className={`mb-1 ${isError ? "text-red-400" : "text-gray-500"}`}>
                Output{isError ? " (error)" : ""}:
              </div>
              <pre
                className={`whitespace-pre-wrap break-all max-h-60 overflow-y-auto ${isError ? "text-red-300" : "text-gray-300"}`}
              >
                {formatOutput(result.content)}
              </pre>
            </div>
          )}
          {isPending && (
            <div className="px-3 py-2 border-t border-gray-700 text-yellow-500 animate-pulse">
              Running...
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function renderEvent(
  event: AgentEvent,
  eventIdx: number,
  allEvents: AgentEvent[],
): React.ReactNode[] | null {
  const data = event.data;

  // Result message
  if (data.type === "result" && data.subtype === "success" && data.result) {
    return [
      <span key="text" className="whitespace-pre-wrap">
        {data.result as string}
      </span>,
    ];
  }

  // Error
  if (event.type === "error") {
    return [
      <span key="text" className="whitespace-pre-wrap">
        Error: {(data.message as string) ?? "Unknown error"}
      </span>,
    ];
  }

  // Assistant message — render text + collapsible tool calls
  if (data.type === "assistant" && data.message) {
    const msg = data.message as { content?: ContentBlock[] };
    if (!msg.content) return null;

    const parts: React.ReactNode[] = [];
    for (const block of msg.content) {
      if (block.type === "text" && block.text) {
        parts.push(
          <span key={`text-${parts.length}`} className="whitespace-pre-wrap">
            {block.text}
          </span>,
        );
      } else if (block.type === "tool_use" && block.id) {
        const result = findToolResult(block.id, allEvents, eventIdx);
        parts.push(
          <ToolCall key={`tool-${block.id}`} block={block} result={result} />,
        );
      }
      // Skip tool_result blocks — they're rendered inside ToolCall
    }
    return parts.length > 0 ? parts : null;
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
      {events.map((event, idx) => {
        const parts = renderEvent(event, idx, events);
        if (!parts) return null;
        return (
          <div key={event.id} className={typeStyles[event.type] ?? "text-gray-400"}>
            <span className="text-gray-600 text-xs mr-2">[{event.type}]</span>
            {parts}
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
