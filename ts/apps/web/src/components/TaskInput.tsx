import { useState } from "react";

export function TaskInput({
  onSubmit,
  disabled,
}: {
  onSubmit: (prompt: string) => void;
  disabled: boolean;
}) {
  const [prompt, setPrompt] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
    setPrompt("");
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 p-3 border-t border-gray-700">
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
    </form>
  );
}
