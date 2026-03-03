import { useEffect, useRef } from "react";
import type { AgentEvent } from "../hooks/useSSE";

const typeIcons: Record<string, string> = {
  milestone: ">>",
  update: "--",
  question: "??",
};

const typeColors: Record<string, string> = {
  milestone: "text-green-400",
  update: "text-blue-400",
  question: "text-yellow-400",
};

export function CommStream({ events }: { events: AgentEvent[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const commEvents = events.filter(
    (e) => e.type === "agent_message" || e.type === "task_end",
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [commEvents.length]);

  if (commEvents.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
        No agent communications yet.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 font-mono text-sm space-y-3">
      {commEvents.map((event) => {
        if (event.type === "task_end") {
          const outcome = event.data.outcome as string;
          const reason = event.data.reason as string | undefined;
          const color =
            outcome === "success" ? "text-green-400" : "text-red-400";
          return (
            <div
              key={event.id}
              className={`${color} border border-current/20 rounded px-3 py-2`}
            >
              <span className="font-bold">
                {outcome === "success" ? "Task completed" : "Task abandoned"}
              </span>
              {reason && (
                <span className="text-gray-400 ml-2">— {reason}</span>
              )}
              <div className="text-gray-600 text-xs mt-1">
                {new Date(event.timestamp).toLocaleTimeString()}
              </div>
            </div>
          );
        }

        const msgType = (event.data.messageType as string) ?? "update";
        const message = event.data.message as string;
        const icon = typeIcons[msgType] ?? "--";
        const color = typeColors[msgType] ?? "text-gray-400";

        return (
          <div key={event.id} className="flex gap-2">
            <span className={`${color} flex-shrink-0`}>{icon}</span>
            <div className="flex-1">
              <span className="whitespace-pre-wrap text-gray-200">
                {message}
              </span>
              <div className="text-gray-600 text-xs mt-0.5">
                <span className={color}>{msgType}</span>
                <span className="mx-1">·</span>
                {new Date(event.timestamp).toLocaleTimeString()}
              </div>
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
