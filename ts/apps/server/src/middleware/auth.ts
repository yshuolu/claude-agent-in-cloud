import type { MiddlewareHandler } from "hono";
import type { AgentStore } from "@cloud-agent/agent-manager";

let agentStore: AgentStore;

export function initAgentStore(store: AgentStore): void {
  agentStore = store;
}

export function getAgentStore(): AgentStore {
  return agentStore;
}

export const agentAuth: MiddlewareHandler = async (c, next) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Missing or invalid Authorization header" }, 401);
  }

  const token = authHeader.slice(7);
  const record = agentStore.getByToken(token);

  if (!record) {
    return c.json({ error: "Invalid auth token" }, 403);
  }

  if (record.status !== "running") {
    return c.json({ error: "Agent is no longer running" }, 403);
  }

  c.set("agentId", record.id);
  await next();
};
