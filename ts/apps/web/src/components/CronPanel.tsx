import { useState } from "react";
import { fetchTasks, runCron, type CronTask, type RunResult } from "../lib/api";

interface CronPanelProps {
  onSessionsCreated?: () => void;
}

export function CronPanel({ onSessionsCreated }: CronPanelProps) {
  const [tasks, setTasks] = useState<CronTask[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<RunResult | null>(null);
  const [fetching, setFetching] = useState(false);
  const [spawning, setSpawning] = useState(false);

  const handleFetch = async () => {
    setFetching(true);
    setResult(null);
    try {
      const t = await fetchTasks();
      setTasks(t);
      setSelected(new Set(t.map((task) => task.id)));
    } finally {
      setFetching(false);
    }
  };

  const handleToggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleAll = () => {
    if (selected.size === tasks.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(tasks.map((t) => t.id)));
    }
  };

  const handleSpawn = async () => {
    if (selected.size === 0) return;
    setSpawning(true);
    try {
      const r = await runCron([...selected]);
      setResult(r);
      if (r.sessions.length > 0) {
        onSessionsCreated?.();
      }
    } finally {
      setSpawning(false);
    }
  };

  const sessions = result?.sessions ?? [];

  return (
    <div className="flex-1 flex flex-col p-4 gap-4">
      {/* Step 1: Fetch */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleFetch}
          disabled={fetching}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded text-sm font-medium"
        >
          {fetching ? "Fetching…" : "Fetch Tasks"}
        </button>
        {tasks.length > 0 && !result && (
          <span className="text-sm text-gray-400">
            {tasks.length} todo task{tasks.length !== 1 && "s"} found
          </span>
        )}
      </div>

      {/* Task list with checkboxes */}
      {tasks.length > 0 && !result && (
        <>
          <div className="space-y-1">
            <label className="flex items-center gap-2 px-3 py-1 text-xs text-gray-400 cursor-pointer">
              <input
                type="checkbox"
                checked={selected.size === tasks.length}
                onChange={handleToggleAll}
                className="accent-blue-500"
              />
              Select all
            </label>
            {tasks.map((task) => (
              <label
                key={task.id}
                className={`flex items-center gap-3 p-3 rounded border cursor-pointer transition-colors ${
                  selected.has(task.id)
                    ? "bg-gray-800 border-blue-500/50"
                    : "bg-gray-800/50 border-gray-700 opacity-60"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(task.id)}
                  onChange={() => handleToggle(task.id)}
                  className="accent-blue-500 flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{task.title}</div>
                  {task.description && (
                    <div className="text-xs text-gray-400 truncate mt-0.5">
                      {task.description}
                    </div>
                  )}
                </div>
                <span className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${
                  task.priority === "urgent" ? "bg-red-900/50 text-red-300" :
                  task.priority === "high" ? "bg-orange-900/50 text-orange-300" :
                  "bg-gray-700 text-gray-400"
                }`}>
                  {task.priority}
                </span>
              </label>
            ))}
          </div>

          {/* Step 2: Spawn */}
          <button
            onClick={handleSpawn}
            disabled={spawning || selected.size === 0}
            className="self-start px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded text-sm font-medium"
          >
            {spawning
              ? "Spawning…"
              : `Spawn ${selected.size} Agent${selected.size !== 1 ? "s" : ""}`}
          </button>
        </>
      )}

      {/* Results */}
      {sessions.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm text-green-400 font-medium">
            Spawned {sessions.length} agent{sessions.length !== 1 && "s"}
          </div>
          <ul className="space-y-2">
            {sessions.map((s) => (
              <li
                key={s.sessionId}
                className="p-3 bg-gray-800 rounded border border-gray-700 text-sm"
              >
                <div className="font-medium">{s.taskTitle}</div>
                <div className="text-gray-400 text-xs mt-1">
                  session: {s.sessionId.slice(0, 8)}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Empty state */}
      {!fetching && tasks.length === 0 && !result && (
        <p className="text-gray-500 text-sm">
          Click Fetch Tasks to pull todo tasks from Lark.
        </p>
      )}
    </div>
  );
}
