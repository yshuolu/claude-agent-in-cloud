import { useState, useEffect } from "react";
import {
  getGitHubStatus,
  listGitHubInstallations,
  listGitHubRepos,
  type GitHubStatus,
  type GitHubInstallation,
  type GitHubRepo,
} from "../lib/api";

interface InstallationWithRepos {
  installation: GitHubInstallation;
  repos: GitHubRepo[];
  expanded: boolean;
}

export function GitHubRepos() {
  const [status, setStatus] = useState<GitHubStatus | null>(null);
  const [items, setItems] = useState<InstallationWithRepos[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const s = await getGitHubStatus();
        if (cancelled) return;
        setStatus(s);

        if (!s.configured) {
          setLoading(false);
          return;
        }

        const installations = await listGitHubInstallations();
        if (cancelled) return;

        const withRepos = await Promise.all(
          installations.map(async (inst) => {
            const repos = await listGitHubRepos(inst.id);
            return { installation: inst, repos, expanded: false };
          }),
        );
        if (cancelled) return;
        setItems(withRepos);
      } catch {
        // Silently handle — section is informational
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleExpand = (index: number) => {
    setItems((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, expanded: !item.expanded } : item,
      ),
    );
  };

  const installUrl = status?.appSlug
    ? `https://github.com/apps/${status.appSlug}/installations/new`
    : null;

  if (loading) {
    return (
      <div className="text-sm text-gray-500 py-2">Loading GitHub status...</div>
    );
  }

  if (!status?.configured) {
    return (
      <div className="text-sm text-gray-600 italic py-2">
        GitHub integration not configured
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-gray-300">GitHub Repos</h2>

      {items.length === 0 && (
        <p className="text-xs text-gray-500">
          No GitHub App installations found.
        </p>
      )}

      {items.map((item, index) => (
        <div
          key={item.installation.id}
          className="border border-gray-700 rounded bg-gray-800/50"
        >
          <button
            onClick={() => toggleExpand(index)}
            className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-800 rounded"
          >
            <span
              className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
              style={{
                backgroundColor: `hsl(${item.installation.account.login.charCodeAt(0) * 37 % 360}, 50%, 40%)`,
              }}
            >
              {item.installation.account.login[0].toUpperCase()}
            </span>
            <span className="text-sm text-gray-200 font-medium">
              {item.installation.account.login}
            </span>
            <span className="text-xs text-gray-500">
              {item.repos.length} repo{item.repos.length !== 1 ? "s" : ""}
            </span>
            <a
              href={`https://github.com/settings/installations/${item.installation.id}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="ml-auto text-xs text-red-400 hover:text-red-300"
            >
              Unbind
            </a>
            <span className="text-xs text-gray-500">
              {item.expanded ? "\u25B2" : "\u25BC"}
            </span>
          </button>

          {item.expanded && (
            <div className="px-3 pb-2 flex flex-wrap gap-1">
              {item.repos.map((repo) => (
                <a
                  key={repo.id}
                  href={repo.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block px-2 py-0.5 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600"
                >
                  {repo.fullName}
                  {repo.private && (
                    <span className="ml-1 text-gray-500">private</span>
                  )}
                </a>
              ))}
              {item.repos.length === 0 && (
                <span className="text-xs text-gray-500">No repos</span>
              )}
            </div>
          )}
        </div>
      ))}

      {installUrl ? (
        <a
          href={installUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-400 hover:text-blue-300"
        >
          + Connect GitHub account
        </a>
      ) : (
        <span className="text-xs text-gray-500">
          Set GITHUB_APP_SLUG to enable connecting new accounts
        </span>
      )}
    </div>
  );
}
