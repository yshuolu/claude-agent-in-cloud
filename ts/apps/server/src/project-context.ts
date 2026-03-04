import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(__dirname, "../../../data");
const filePath = resolve(dataDir, "business.md");
const tokenPath = resolve(dataDir, "github-token");

export function getProjectContext(): string {
  if (!existsSync(filePath)) return "";
  return readFileSync(filePath, "utf-8");
}

export function setProjectContext(content: string): void {
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(filePath, content, "utf-8");
}

// --- GitHub Token ---

export function getGitHubToken(): string | null {
  if (!existsSync(tokenPath)) return null;
  const token = readFileSync(tokenPath, "utf-8").trim();
  return token || null;
}

export function setGitHubToken(token: string): void {
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(tokenPath, token.trim(), "utf-8");
}

export function clearGitHubToken(): void {
  if (existsSync(tokenPath)) unlinkSync(tokenPath);
}

export function detectGitHubToken(): string | null {
  try {
    const token = execSync("gh auth token", {
      encoding: "utf-8",
      timeout: 5000,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    return token || null;
  } catch {
    return null;
  }
}

export function maskToken(token: string): string {
  if (token.length <= 8) return "****";
  return token.slice(0, 4) + "****" + token.slice(-4);
}
