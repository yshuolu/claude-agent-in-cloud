import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type {
  Task,
  TaskQuery,
  CreateTaskInput,
  UpdateTaskInput,
  TaskStore,
  TaskStatus,
  TaskPriority,
} from "./types.js";

interface TaskRow {
  id: string;
  title: string;
  description: string;
  status: string;
  assignee: string | null;
  priority: string;
  labels: string;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
}

function rowToTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status as TaskStatus,
    assignee: row.assignee,
    priority: row.priority as TaskPriority,
    labels: JSON.parse(row.labels) as string[],
    parentId: row.parent_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SqliteTaskStore implements TaskStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'todo',
        assignee TEXT,
        priority TEXT NOT NULL DEFAULT 'medium',
        labels TEXT NOT NULL DEFAULT '[]',
        parent_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
      CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee);
      CREATE INDEX IF NOT EXISTS idx_tasks_parent_id ON tasks(parent_id);
    `);
  }

  async create(input: CreateTaskInput): Promise<Task> {
    const now = new Date().toISOString();
    const id = randomUUID();

    const stmt = this.db.prepare(`
      INSERT INTO tasks (id, title, description, status, assignee, priority, labels, parent_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      input.title,
      input.description ?? "",
      input.status ?? "todo",
      input.assignee ?? null,
      input.priority ?? "medium",
      JSON.stringify(input.labels ?? []),
      input.parentId ?? null,
      now,
      now,
    );

    return (await this.get(id))!;
  }

  async get(id: string): Promise<Task | null> {
    const row = this.db
      .prepare("SELECT * FROM tasks WHERE id = ?")
      .get(id) as TaskRow | undefined;
    return row ? rowToTask(row) : null;
  }

  async list(query?: TaskQuery): Promise<Task[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (query?.status) {
      conditions.push("status = ?");
      params.push(query.status);
    }
    if (query?.assignee) {
      conditions.push("assignee = ?");
      params.push(query.assignee);
    }
    if (query?.priority) {
      conditions.push("priority = ?");
      params.push(query.priority);
    }
    if (query?.label) {
      conditions.push("labels LIKE ?");
      params.push(`%"${query.label}"%`);
    }
    if (query?.parentId) {
      conditions.push("parent_id = ?");
      params.push(query.parentId);
    }

    let sql = "SELECT * FROM tasks";
    if (conditions.length > 0) {
      sql += " WHERE " + conditions.join(" AND ");
    }
    sql += " ORDER BY created_at DESC";

    if (query?.limit) {
      sql += " LIMIT ?";
      params.push(query.limit);
    }
    if (query?.offset) {
      sql += " OFFSET ?";
      params.push(query.offset);
    }

    const rows = this.db.prepare(sql).all(...params) as TaskRow[];
    return rows.map(rowToTask);
  }

  async update(id: string, input: UpdateTaskInput): Promise<Task | null> {
    const existing = await this.get(id);
    if (!existing) return null;

    const sets: string[] = [];
    const params: unknown[] = [];

    if (input.title !== undefined) {
      sets.push("title = ?");
      params.push(input.title);
    }
    if (input.description !== undefined) {
      sets.push("description = ?");
      params.push(input.description);
    }
    if (input.status !== undefined) {
      sets.push("status = ?");
      params.push(input.status);
    }
    if (input.assignee !== undefined) {
      sets.push("assignee = ?");
      params.push(input.assignee);
    }
    if (input.priority !== undefined) {
      sets.push("priority = ?");
      params.push(input.priority);
    }
    if (input.labels !== undefined) {
      sets.push("labels = ?");
      params.push(JSON.stringify(input.labels));
    }
    if (input.parentId !== undefined) {
      sets.push("parent_id = ?");
      params.push(input.parentId);
    }

    if (sets.length === 0) return existing;

    sets.push("updated_at = ?");
    params.push(new Date().toISOString());
    params.push(id);

    this.db
      .prepare(`UPDATE tasks SET ${sets.join(", ")} WHERE id = ?`)
      .run(...params);

    return (await this.get(id))!;
  }

  async delete(id: string): Promise<boolean> {
    const result = this.db.prepare("DELETE FROM tasks WHERE id = ?").run(id);
    return result.changes > 0;
  }

  close(): void {
    this.db.close();
  }
}
