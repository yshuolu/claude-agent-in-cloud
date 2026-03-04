import { useState, useEffect, useRef } from "react";
import {
  listUserRepos,
  listRepoBranches,
  getGitHubTokenStatus,
  type GitHubRepoOption,
  type GitHubBranch,
  type RepoContext,
} from "../lib/api";

export function TaskInput({
  onSubmit,
  disabled,
}: {
  onSubmit: (prompt: string, repoContext?: RepoContext) => void;
  disabled: boolean;
}) {
  const [prompt, setPrompt] = useState("");
  const [hasToken, setHasToken] = useState(false);

  // Repo selector state
  const [repos, setRepos] = useState<GitHubRepoOption[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepoOption | null>(null);
  const [repoSearch, setRepoSearch] = useState("");
  const [repoDropdownOpen, setRepoDropdownOpen] = useState(false);
  const repoDropdownRef = useRef<HTMLDivElement>(null);

  // Branch selector state
  const [branches, setBranches] = useState<GitHubBranch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>("");

  // Check token status on mount
  useEffect(() => {
    getGitHubTokenStatus().then((s) => setHasToken(s.configured)).catch(() => {});
  }, []);

  // Load repos on mount and when search changes
  useEffect(() => {
    if (!hasToken) return;
    const timeout = setTimeout(() => {
      listUserRepos(repoSearch || undefined).then(setRepos).catch(() => {});
    }, repoSearch ? 300 : 0);
    return () => clearTimeout(timeout);
  }, [hasToken, repoSearch]);

  // Load branches when repo changes
  useEffect(() => {
    if (!selectedRepo) {
      setBranches([]);
      setSelectedBranch("");
      return;
    }
    listRepoBranches(selectedRepo.owner, selectedRepo.name)
      .then((b) => {
        setBranches(b);
        setSelectedBranch(selectedRepo.defaultBranch);
      })
      .catch(() => {});
  }, [selectedRepo]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (repoDropdownRef.current && !repoDropdownRef.current.contains(e.target as Node)) {
        setRepoDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed || disabled) return;

    let repoContext: RepoContext | undefined;
    if (selectedRepo && selectedBranch) {
      repoContext = {
        owner: selectedRepo.owner,
        repo: selectedRepo.name,
        fullName: selectedRepo.fullName,
        branch: selectedBranch,
        cloneUrl: `https://github.com/${selectedRepo.fullName}.git`,
      };
    }

    onSubmit(trimmed, repoContext);
    setPrompt("");
  };

  return (
    <form onSubmit={handleSubmit} className="p-3 border-t border-gray-700 space-y-2">
      {hasToken && (
        <div className="flex gap-2">
          {/* Repo selector */}
          <div className="relative flex-1" ref={repoDropdownRef}>
            <button
              type="button"
              onClick={() => setRepoDropdownOpen(!repoDropdownOpen)}
              className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-xs text-left text-gray-300 hover:border-gray-600 truncate"
            >
              {selectedRepo ? selectedRepo.fullName : "(No repo)"}
            </button>
            {repoDropdownOpen && (
              <div className="absolute bottom-full left-0 w-full mb-1 bg-gray-800 border border-gray-700 rounded shadow-lg z-10 max-h-60 overflow-y-auto">
                <input
                  type="text"
                  value={repoSearch}
                  onChange={(e) => setRepoSearch(e.target.value)}
                  placeholder="Search repos..."
                  className="w-full px-3 py-1.5 bg-gray-900 border-b border-gray-700 text-xs text-white placeholder-gray-500 focus:outline-none"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => {
                    setSelectedRepo(null);
                    setRepoDropdownOpen(false);
                  }}
                  className="w-full px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-700 text-left"
                >
                  (No repo)
                </button>
                {repos.map((r) => (
                  <button
                    type="button"
                    key={r.id}
                    onClick={() => {
                      setSelectedRepo(r);
                      setRepoDropdownOpen(false);
                      setRepoSearch("");
                    }}
                    className={`w-full px-3 py-1.5 text-xs hover:bg-gray-700 text-left truncate ${
                      selectedRepo?.id === r.id ? "text-blue-400" : "text-gray-300"
                    }`}
                  >
                    {r.fullName}
                    {r.private && <span className="ml-1 text-gray-600">private</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Branch selector */}
          {selectedRepo && (
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-xs text-gray-300 focus:outline-none focus:border-blue-500 max-w-[180px]"
            >
              {branches.map((b) => (
                <option key={b.name} value={b.name}>
                  {b.name}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={disabled ? "Agent is running..." : "Enter a task..."}
          disabled={disabled}
          className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={disabled || !prompt.trim()}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded text-sm font-medium cursor-pointer disabled:cursor-not-allowed"
        >
          Run
        </button>
      </div>
    </form>
  );
}
