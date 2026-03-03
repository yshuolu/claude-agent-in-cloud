import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(__dirname, "../../../data");
const filePath = resolve(dataDir, "business.md");

export function getProjectContext(): string {
  if (!existsSync(filePath)) return "";
  return readFileSync(filePath, "utf-8");
}

export function setProjectContext(content: string): void {
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(filePath, content, "utf-8");
}
