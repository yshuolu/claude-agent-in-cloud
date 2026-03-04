import { useState, useEffect } from "react";
import {
  getGitHubTokenStatus,
  setGitHubToken,
  clearGitHubToken,
  detectGitHubToken,
  type GitHubTokenStatus,
} from "../lib/api";

export function GitHubToken() {
  const [status, setStatus] = useState<GitHubTokenStatus | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [detecting, setDetecting] = useState(false);

  useEffect(() => {
    getGitHubTokenStatus()
      .then(setStatus)
      .catch(() => setStatus({ configured: false }))
      .finally(() => setLoading(false));
  }, []);

  const handleDetect = async () => {
    setDetecting(true);
    try {
      const result = await detectGitHubToken();
      setStatus(result);
    } catch {
      // ignore
    } finally {
      setDetecting(false);
    }
  };

  const handleSave = async () => {
    if (!input.trim()) return;
    const result = await setGitHubToken(input.trim());
    setStatus(result);
    setInput("");
  };

  const handleClear = async () => {
    await clearGitHubToken();
    setStatus({ configured: false });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSave();
  };

  if (loading) {
    return (
      <div className="text-sm text-gray-500 py-2">
        Loading GitHub status...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-gray-300">GitHub Access</h2>

      {status?.configured ? (
        <div className="flex items-center gap-2 px-3 py-2 border border-gray-700 rounded bg-gray-800/50">
          <span className="text-green-400 text-sm">Connected</span>
          <code className="text-xs text-gray-400">{status.masked}</code>
          <div className="ml-auto flex gap-2">
            <button
              onClick={handleDetect}
              disabled={detecting}
              className="text-xs text-gray-400 hover:text-gray-200"
            >
              {detecting ? "Detecting..." : "Detect from gh CLI"}
            </button>
            <button
              onClick={handleClear}
              className="text-xs text-red-400 hover:text-red-300"
            >
              Clear
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 px-3 py-2 border border-gray-700 rounded bg-gray-800/50">
          <span className="text-sm text-gray-500">Not connected</span>
          <button
            onClick={handleDetect}
            disabled={detecting}
            className="ml-auto text-xs text-blue-400 hover:text-blue-300"
          >
            {detecting ? "Detecting..." : "Detect from gh CLI"}
          </button>
        </div>
      )}

      {!status?.configured && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 shrink-0">
            Or paste a token:
          </span>
          <input
            type="password"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="ghp_..."
            className="flex-1 bg-gray-800 text-gray-200 border border-gray-700 rounded px-2 py-1 text-xs font-mono focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={handleSave}
            disabled={!input.trim()}
            className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded text-white"
          >
            Save
          </button>
        </div>
      )}
    </div>
  );
}
