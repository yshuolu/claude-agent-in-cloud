// @ts-nocheck — MCP SDK + Zod v3/v4 compat causes deep type instantiation errors
import { Hono } from "hono";
import { v4 as uuidv4 } from "uuid";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod/v3";
import type { EventStore, StoredEvent } from "@cloud-agent/event-store";

let eventStore: EventStore;
let updateSessionStatus: (id: string, status: string) => void;

export function initCommunicateStore(store: EventStore): void {
  eventStore = store;
}

export function initCommunicateSessionUpdater(
  fn: (id: string, status: string) => void,
): void {
  updateSessionStatus = fn;
}

function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "communicate",
    version: "0.1.0",
  });

  server.tool(
    "send_message",
    "Send a status update, milestone, or question to the user via the session event stream",
    {
      sessionId: z.string().describe("The session ID"),
      message: z.string().describe("The message content"),
      type: z
        .enum(["milestone", "update", "question"])
        .describe("Message type: milestone (key achievement), update (progress), or question (need input)"),
    },
    async (args: Record<string, unknown>) => {
      const event: StoredEvent = {
        id: uuidv4(),
        sessionId: args.sessionId as string,
        timestamp: new Date().toISOString(),
        type: "agent_message",
        data: {
          message: args.message as string,
          messageType: args.type as string,
        },
      };
      eventStore.append(event);
      return {
        content: [{ type: "text" as const, text: "Message sent successfully" }],
      };
    },
  );

  server.tool(
    "mark_end",
    "Signal that the agent has finished the current task",
    {
      sessionId: z.string().describe("The session ID"),
      outcome: z
        .enum(["success", "give_up"])
        .describe("Whether the task was completed successfully or the agent is giving up"),
      reason: z
        .string()
        .optional()
        .describe("Explanation of the outcome, especially important when giving up"),
    },
    async (args: Record<string, unknown>) => {
      const event: StoredEvent = {
        id: uuidv4(),
        sessionId: args.sessionId as string,
        timestamp: new Date().toISOString(),
        type: "task_end",
        data: {
          outcome: args.outcome as string,
          reason: (args.reason as string) ?? undefined,
        },
      };
      eventStore.append(event);

      if (updateSessionStatus) {
        const status = args.outcome === "success" ? "completed" : "error";
        updateSessionStatus(args.sessionId as string, status);
      }

      return {
        content: [
          {
            type: "text" as const,
            text: `Task marked as ${args.outcome}${args.reason ? `: ${args.reason}` : ""}`,
          },
        ],
      };
    },
  );

  return server;
}

const app = new Hono();

app.all("/*", async (c) => {
  const transport = new WebStandardStreamableHTTPServerTransport();
  const server = createMcpServer();
  await server.connect(transport);
  return transport.handleRequest(c.req.raw);
});

export default app;
