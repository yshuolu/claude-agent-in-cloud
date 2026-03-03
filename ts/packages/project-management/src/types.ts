export type TaskStatus = "todo" | "in_progress" | "in_review" | "done" | "cancelled";
export type TaskPriority = "low" | "medium" | "high" | "urgent";

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  assignee: string | null;
  priority: TaskPriority;
  labels: string[];
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskQuery {
  status?: TaskStatus;
  assignee?: string;
  priority?: TaskPriority;
  label?: string;
  parentId?: string;
  limit?: number;
  offset?: number;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  status?: TaskStatus;
  assignee?: string | null;
  priority?: TaskPriority;
  labels?: string[];
  parentId?: string | null;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  status?: TaskStatus;
  assignee?: string | null;
  priority?: TaskPriority;
  labels?: string[];
  parentId?: string | null;
}

export interface TaskStore {
  create(input: CreateTaskInput): Task;
  get(id: string): Task | null;
  list(query?: TaskQuery): Task[];
  update(id: string, input: UpdateTaskInput): Task | null;
  delete(id: string): boolean;
  close(): void;
}
