import type { Session } from "../lib/api";

const statusColors: Record<string, string> = {
  idle: "bg-gray-400",
  running: "bg-blue-500 animate-pulse",
  completed: "bg-green-500",
  error: "bg-red-500",
};

export function SessionList({
  sessions,
  activeId,
  onSelect,
  onCreate,
  onDelete,
}: {
  sessions: Session[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-gray-700">
        <button
          onClick={onCreate}
          className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium cursor-pointer"
        >
          + New Session
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {sessions.map((s) => (
          <div
            key={s.id}
            onClick={() => onSelect(s.id)}
            className={`flex items-center gap-2 px-3 py-2 cursor-pointer border-b border-gray-800 hover:bg-gray-800 ${
              s.id === activeId ? "bg-gray-800" : ""
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${statusColors[s.status] ?? "bg-gray-400"}`}
            />
            <span className="text-sm text-gray-300 truncate font-mono">
              {s.id.slice(0, 8)}
            </span>
            <span className="text-xs text-gray-500 ml-auto">{s.status}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(s.id);
              }}
              className="text-gray-600 hover:text-red-400 text-xs cursor-pointer"
            >
              ✕
            </button>
          </div>
        ))}
        {sessions.length === 0 && (
          <p className="p-3 text-gray-500 text-sm">No sessions yet</p>
        )}
      </div>
    </div>
  );
}
