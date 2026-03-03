import { Hono } from "hono";
import { agentAuth } from "../middleware/auth.js";
import type { TaskStore, TaskQuery, CreateTaskInput, UpdateTaskInput, TaskStatus, TaskPriority } from "@cloud-agent/project-management";

let taskStore: TaskStore;

export function initTaskStore(store: TaskStore): void {
  taskStore = store;
}

const app = new Hono();

// All routes require agent auth
app.use("*", agentAuth);

// POST /tasks — create a task
app.post("/", async (c) => {
  const body = (await c.req.json()) as CreateTaskInput;
  if (!body.title) {
    return c.json({ error: "title is required" }, 400);
  }
  const task = await taskStore.create(body);
  return c.json(task, 201);
});

// GET /tasks — list tasks with optional filters
app.get("/", async (c) => {
  const query: TaskQuery = {};
  const status = c.req.query("status");
  if (status) query.status = status as TaskStatus;
  const assignee = c.req.query("assignee");
  if (assignee) query.assignee = assignee;
  const priority = c.req.query("priority");
  if (priority) query.priority = priority as TaskPriority;
  const label = c.req.query("label");
  if (label) query.label = label;
  const parentId = c.req.query("parentId");
  if (parentId) query.parentId = parentId;
  const limit = c.req.query("limit");
  if (limit) query.limit = parseInt(limit, 10);
  const offset = c.req.query("offset");
  if (offset) query.offset = parseInt(offset, 10);

  const tasks = await taskStore.list(query);
  return c.json(tasks);
});

// GET /tasks/:taskId — get single task
app.get("/:taskId", async (c) => {
  const task = await taskStore.get(c.req.param("taskId"));
  if (!task) {
    return c.json({ error: "Task not found" }, 404);
  }
  return c.json(task);
});

// PATCH /tasks/:taskId — update task
app.patch("/:taskId", async (c) => {
  const body = (await c.req.json()) as UpdateTaskInput;
  const task = await taskStore.update(c.req.param("taskId"), body);
  if (!task) {
    return c.json({ error: "Task not found" }, 404);
  }
  return c.json(task);
});

// DELETE /tasks/:taskId — delete task
app.delete("/:taskId", async (c) => {
  const deleted = await taskStore.delete(c.req.param("taskId"));
  if (!deleted) {
    return c.json({ error: "Task not found" }, 404);
  }
  return c.json({ ok: true });
});

export default app;
