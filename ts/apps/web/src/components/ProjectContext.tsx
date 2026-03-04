import { useState, useEffect } from "react";
import { getProjectContext, updateProjectContext } from "../lib/api";
import { GitHubRepos } from "./GitHubRepos";

export function ProjectContext() {
  const [content, setContent] = useState("");
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getProjectContext()
      .then((c) => setContent(c))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    await updateProjectContext(content);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col p-4 gap-3 overflow-y-auto">
      <GitHubRepos />

      <hr className="border-gray-700" />

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-gray-300">
          Project Context (business.md)
        </h2>
        <button
          onClick={handleSave}
          className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-500 rounded text-white"
        >
          {saved ? "Saved!" : "Save"}
        </button>
      </div>
      <p className="text-xs text-gray-500">
        This context is available to all agents via the get_project_context MCP
        tool. Describe your project, business rules, preferences, and any
        standing instructions.
      </p>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Describe your project here... (Markdown supported)"
        className="flex-1 bg-gray-800 text-gray-200 border border-gray-700 rounded p-3 text-sm font-mono resize-none focus:outline-none focus:border-blue-500"
      />
    </div>
  );
}
