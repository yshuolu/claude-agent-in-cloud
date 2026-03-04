import { useState, useEffect, useCallback } from "react";
import { SessionList } from "./components/SessionList";
import { TaskInput } from "./components/TaskInput";
import { EventStream } from "./components/EventStream";
import { CronPanel } from "./components/CronPanel";
import { ProjectContext } from "./components/ProjectContext";
import { CommStream } from "./components/CommStream";
import { useSSE } from "./hooks/useSSE";
import {
  createSession,
  getSession,
  listSessions,
  deleteSession,
  submitTask,
  eventsUrl,
  type Session,
} from "./lib/api";

type Tab = "sessions" | "run" | "context";

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("sessions");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sseUrl, setSseUrl] = useState<string | null>(null);
  const [sessionView, setSessionView] = useState<"events" | "comms">("events");
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

  const handleSelect = async (id: string) => {
    setActiveId(id);
    clear();
    setSseUrl(eventsUrl(id));
    // Refresh session status from server to avoid stale "running" state
    try {
      const session = await getSession(id);
      setSessions((prev) =>
        prev.map((s) => (s.id === id ? { ...s, status: session.status } : s)),
      );
    } catch {
      // Best-effort refresh
    }
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
        {/* Tab bar */}
        <div className="flex border-b border-gray-700">
          {(["sessions", "run", "context"] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium capitalize ${
                activeTab === tab
                  ? "text-white border-b-2 border-blue-500"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {activeTab === "context" ? (
          <ProjectContext />
        ) : activeTab === "run" ? (
          <CronPanel onSessionsCreated={refresh} />
        ) : activeId ? (
          <>
            <div className="px-4 py-2 border-b border-gray-700 text-xs text-gray-400 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-mono">{activeId.slice(0, 8)}</span>
                <span className="text-gray-600">|</span>
                <span>{activeSession?.status ?? "unknown"}</span>
              </div>
              <div className="flex gap-1">
                {(["comms", "events"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setSessionView(v)}
                    className={`px-2 py-0.5 rounded text-xs capitalize ${
                      sessionView === v
                        ? "bg-gray-700 text-white"
                        : "text-gray-500 hover:text-gray-300"
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
            {sessionView === "comms" ? (
              <CommStream events={events} />
            ) : (
              <EventStream events={events} status={status} />
            )}
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
