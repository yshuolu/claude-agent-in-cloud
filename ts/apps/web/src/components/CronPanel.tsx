import { useState } from "react";
import { runCron, type CronTask, type RunResult } from "../lib/api";

interface CronPanelProps {
  onSessionsCreated?: () => void;
}

export function CronPanel({ onSessionsCreated }: CronPanelProps) {
  const [result, setResult] = useState<RunResult | null>(null);
  const [loading, setLoading] = useState(false);

  const handleRun = async () => {
    setLoading(true);
    try {
      const r = await runCron();
      setResult(r);
      if (r.sessions.length > 0) {
        onSessionsCreated?.();
      }
    } finally {
      setLoading(false);
    }
  };

  const tasks = result?.tasks ?? [];
  const sessions = result?.sessions ?? [];

  return (
    <div className="flex-1 flex flex-col p-4">
      <button
        onClick={handleRun}
        disabled={loading}
        className="self-start px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded text-sm font-medium"
      >
        {loading ? "Running…" : "Run"}
      </button>

      {sessions.length > 0 && (
        <ul className="mt-4 space-y-2">
          {sessions.map((s) => {
            const task = tasks.find((t) => t.id === s.taskId);
            return (
              <li
                key={s.sessionId}
                className="p-3 bg-gray-800 rounded border border-gray-700 text-sm"
              >
                <div className="font-medium">{s.taskTitle}</div>
                <div className="text-gray-400 text-xs mt-1">
                  session: {s.sessionId.slice(0, 8)}
                  {task && (
                    <> &middot; priority: {task.priority}</>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {!loading && tasks.length === 0 && (
        <p className="mt-4 text-gray-500 text-sm">
          No todo tasks. Click Run to fetch.
        </p>
      )}
    </div>
  );
}
