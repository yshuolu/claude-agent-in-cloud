import { useState, useEffect, useCallback } from "react";
import { SessionList } from "./components/SessionList";
import { TaskInput } from "./components/TaskInput";
import { EventStream } from "./components/EventStream";
import { useSSE } from "./hooks/useSSE";
import {
  createSession,
  listSessions,
  deleteSession,
  submitTask,
  eventsUrl,
  type Session,
} from "./lib/api";

export default function App() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sseUrl, setSseUrl] = useState<string | null>(null);
  const { events, status, clear } = useSSE(sseUrl);

  const activeSession = sessions.find((s) => s.id === activeId);

  // When the agent finishes a turn, set session status back to idle
  useEffect(() => {
    if (!activeId || events.length === 0) return;
    const last = events[events.length - 1];
    if (last.type === "turn_complete") {
      setSessions((prev) =>
        prev.map((s) => (s.id === activeId ? { ...s, status: "idle" as const } : s)),
      );
    }
  }, [events, activeId]);

  const refresh = useCallback(async () => {
    const list = await listSessions();
    setSessions(list);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleCreate = async () => {
    const session = await createSession();
    setSessions((prev) => [session, ...prev]);
    setActiveId(session.id);
    setSseUrl(null);
    clear();
  };

  const handleDelete = async (id: string) => {
    await deleteSession(id);
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (activeId === id) {
      setActiveId(null);
      setSseUrl(null);
      clear();
    }
  };

  const handleSelect = (id: string) => {
    setActiveId(id);
    clear();
    setSseUrl(eventsUrl(id));
  };

  const handleSubmit = async (prompt: string) => {
    if (!activeId) return;
    // Update local status
    setSessions((prev) =>
      prev.map((s) => (s.id === activeId ? { ...s, status: "running" as const } : s)),
    );
    clear();
    setSseUrl(eventsUrl(activeId));
    await submitTask(activeId, prompt);
  };

  return (
    <div className="flex h-screen bg-gray-900 text-white">
      {/* Sidebar */}
      <div className="w-64 border-r border-gray-700 flex-shrink-0">
        <SessionList
          sessions={sessions}
          activeId={activeId}
          onSelect={handleSelect}
          onCreate={handleCreate}
          onDelete={handleDelete}
        />
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col">
        {activeId ? (
          <>
            <div className="px-4 py-2 border-b border-gray-700 text-xs text-gray-400 flex items-center gap-2">
              <span className="font-mono">{activeId.slice(0, 8)}</span>
              <span className="text-gray-600">|</span>
              <span>{activeSession?.status ?? "unknown"}</span>
            </div>
            <EventStream events={events} status={status} />
            <TaskInput
              onSubmit={handleSubmit}
              disabled={activeSession?.status === "running"}
            />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            Create or select a session to get started.
          </div>
        )}
      </div>
    </div>
  );
}
