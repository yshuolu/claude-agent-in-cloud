#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { TaskApiClient } from "./api-client.js";

const serverUrl = process.env.SERVER_URL;
const authToken = process.env.AGENT_AUTH_TOKEN;

if (!serverUrl) {
  console.error("[mcp-project-management] SERVER_URL is required");
  process.exit(1);
}
if (!authToken) {
  console.error("[mcp-project-management] AGENT_AUTH_TOKEN is required");
  process.exit(1);
}

const client = new TaskApiClient(serverUrl, authToken);

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
    status: z
      .enum(["todo", "in_progress", "in_review", "done", "cancelled"])
      .optional()
      .describe("Task status (default: todo)"),
    assignee: z.string().optional().describe("Assignee identifier"),
    priority: z
      .enum(["low", "medium", "high", "urgent"])
      .optional()
      .describe("Task priority (default: medium)"),
    labels: z.array(z.string()).optional().describe("Task labels"),
    parentId: z.string().optional().describe("Parent task ID for subtasks"),
  },
  async (args) => {
    const task = await client.createTask(args);
    return { content: [{ type: "text" as const, text: JSON.stringify(task, null, 2) }] };
  },
);

server.tool(
  "list_tasks",
  "List tasks with optional filters",
  {
    status: z
      .enum(["todo", "in_progress", "in_review", "done", "cancelled"])
      .optional()
      .describe("Filter by status"),
    assignee: z.string().optional().describe("Filter by assignee"),
    priority: z
      .enum(["low", "medium", "high", "urgent"])
      .optional()
      .describe("Filter by priority"),
    label: z.string().optional().describe("Filter by label"),
    parentId: z.string().optional().describe("Filter by parent task ID"),
    limit: z.number().optional().describe("Max results"),
    offset: z.number().optional().describe("Offset for pagination"),
  },
  async (args) => {
    const tasks = await client.listTasks(args);
    return { content: [{ type: "text" as const, text: JSON.stringify(tasks, null, 2) }] };
  },
);

server.tool(
  "get_task",
  "Get a single task by ID",
  {
    id: z.string().describe("Task ID"),
  },
  async (args) => {
    const task = await client.getTask(args.id);
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
    status: z
      .enum(["todo", "in_progress", "in_review", "done", "cancelled"])
      .optional()
      .describe("New status"),
    assignee: z.string().nullable().optional().describe("New assignee (null to unassign)"),
    priority: z
      .enum(["low", "medium", "high", "urgent"])
      .optional()
      .describe("New priority"),
    labels: z.array(z.string()).optional().describe("New labels"),
    parentId: z.string().nullable().optional().describe("New parent task ID"),
  },
  async (args) => {
    const { id, ...input } = args;
    const task = await client.updateTask(id, input);
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
  async (args) => {
    const deleted = await client.deleteTask(args.id);
    if (!deleted) {
      return { content: [{ type: "text" as const, text: "Task not found" }], isError: true };
    }
    return { content: [{ type: "text" as const, text: "Task deleted successfully" }] };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
