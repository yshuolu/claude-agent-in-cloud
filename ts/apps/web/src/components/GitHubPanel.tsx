import { GitHubToken } from "./GitHubToken";
import { GitHubRepos } from "./GitHubRepos";

export function GitHubPanel() {
  return (
    <div className="flex-1 flex flex-col p-4 gap-3 overflow-y-auto">
      <GitHubToken />

      <hr className="border-gray-700" />

      <GitHubRepos />
    </div>
  );
}
