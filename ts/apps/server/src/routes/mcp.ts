// @ts-nocheck — MCP SDK + Zod v3/v4 compat causes deep type instantiation errors
import { Hono } from "hono";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod/v3";
import type { TaskStore } from "@cloud-agent/project-management";

let taskStore: TaskStore;

export function initMcpTaskStore(store: TaskStore): void {
  taskStore = store;
}

const statusEnum = z.enum(["todo", "in_progress", "in_review", "done", "cancelled"]);
const priorityEnum = z.enum(["low", "medium", "high", "urgent"]);

function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "project-management",
    version: "0.1.0",
  });

  server.tool(
    "create_task",
    "Create a new task in the project task board",
    {
      title: z.string().describe("Task title"),
      description: z.string().optional().describe("Task description"),
      status: statusEnum.optional().describe("Task status (default: todo)"),
      assignee: z.string().optional().describe("Assignee identifier"),
      priority: priorityEnum.optional().describe("Task priority (default: medium)"),
      labels: z.array(z.string()).optional().describe("Task labels"),
      parentId: z.string().optional().describe("Parent task ID for subtasks"),
    },
    async (args: Record<string, unknown>) => {
      const task = await taskStore.create(args as Parameters<TaskStore["create"]>[0]);
      return { content: [{ type: "text" as const, text: JSON.stringify(task, null, 2) }] };
    },
  );

  server.tool(
    "list_tasks",
    "List tasks with optional filters",
    {
      status: statusEnum.optional().describe("Filter by status"),
      assignee: z.string().optional().describe("Filter by assignee"),
      priority: priorityEnum.optional().describe("Filter by priority"),
      label: z.string().optional().describe("Filter by label"),
      parentId: z.string().optional().describe("Filter by parent task ID"),
      limit: z.number().optional().describe("Max results"),
      offset: z.number().optional().describe("Offset for pagination"),
    },
    async (args: Record<string, unknown>) => {
      const tasks = await taskStore.list(args as Parameters<TaskStore["list"]>[0]);
      return { content: [{ type: "text" as const, text: JSON.stringify(tasks, null, 2) }] };
    },
  );

  server.tool(
    "get_task",
    "Get a single task by ID",
    {
      id: z.string().describe("Task ID"),
    },
    async (args: Record<string, unknown>) => {
      const task = await taskStore.get(args.id as string);
      if (!task) {
        return { content: [{ type: "text" as const, text: "Task not found" }], isError: true };
      }
      return { content: [{ type: "text" as const, text: JSON.stringify(task, null, 2) }] };
    },
  );

  server.tool(
    "update_task",
    "Update an existing task",
    {
      id: z.string().describe("Task ID"),
      title: z.string().optional().describe("New title"),
      description: z.string().optional().describe("New description"),
      status: statusEnum.optional().describe("New status"),
      assignee: z.string().nullable().optional().describe("New assignee (null to unassign)"),
      priority: priorityEnum.optional().describe("New priority"),
      labels: z.array(z.string()).optional().describe("New labels"),
      parentId: z.string().nullable().optional().describe("New parent task ID"),
    },
    async (args: Record<string, unknown>) => {
      const { id, ...input } = args;
      const task = await taskStore.update(id as string, input as Parameters<TaskStore["update"]>[1]);
      if (!task) {
        return { content: [{ type: "text" as const, text: "Task not found" }], isError: true };
      }
      return { content: [{ type: "text" as const, text: JSON.stringify(task, null, 2) }] };
    },
  );

  server.tool(
    "delete_task",
    "Delete a task by ID",
    {
      id: z.string().describe("Task ID"),
    },
    async (args: Record<string, unknown>) => {
      const deleted = await taskStore.delete(args.id as string);
      if (!deleted) {
        return { content: [{ type: "text" as const, text: "Task not found" }], isError: true };
      }
      return { content: [{ type: "text" as const, text: "Task deleted successfully" }] };
    },
  );

  return server;
}

const app = new Hono();

// Streamable HTTP MCP endpoint — stateless (new server per request)
app.all("/*", async (c) => {
  const transport = new WebStandardStreamableHTTPServerTransport();
  const server = createMcpServer();
  await server.connect(transport);
  return transport.handleRequest(c.req.raw);
});

export default app;
