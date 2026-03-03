import { useEffect, useRef, useState, useCallback } from "react";

export interface AgentEvent {
  id: string;
  sessionId: string;
  timestamp: string;
  type: string;
  data: Record<string, unknown>;
}

export function useSSE(url: string | null) {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [status, setStatus] = useState<"idle" | "connected" | "done" | "error">(
    "idle",
  );
  const esRef = useRef<EventSource | null>(null);

  const clear = useCallback(() => {
    setEvents([]);
    setStatus("idle");
  }, []);

  useEffect(() => {
    if (!url) return;

    setStatus("connected");
    const es = new EventSource(url);
    esRef.current = es;

    const handleEvent = (e: MessageEvent) => {
      try {
        const event: AgentEvent = JSON.parse(e.data);
        setEvents((prev) => [...prev, event]);
      } catch {
        // ignore parse errors
      }
    };

    es.addEventListener("system", handleEvent);
    es.addEventListener("assistant", handleEvent);
    es.addEventListener("user", handleEvent);
    es.addEventListener("result", handleEvent);
    es.addEventListener("error", handleEvent);
    es.addEventListener("turn_complete", handleEvent);
    es.addEventListener("agent_message", handleEvent);
    es.addEventListener("task_end", handleEvent);

    es.addEventListener("done", () => {
      setStatus("done");
      es.close();
    });

    es.onerror = () => {
      setStatus("error");
      es.close();
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [url]);

  return { events, status, clear };
}
