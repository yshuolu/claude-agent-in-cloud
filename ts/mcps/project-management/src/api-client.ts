import type {
  Task,
  TaskQuery,
  CreateTaskInput,
  UpdateTaskInput,
} from "@cloud-agent/project-management/types";

export class TaskApiClient {
  private baseUrl: string;
  private authToken: string;

  constructor(baseUrl: string, authToken: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.authToken = authToken;
  }

  private headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.authToken}`,
    };
  }

  async createTask(input: CreateTaskInput): Promise<Task> {
    const res = await fetch(`${this.baseUrl}/tasks`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Failed to create task (${res.status}): ${body}`);
    }
    return (await res.json()) as Task;
  }

  async listTasks(query?: TaskQuery): Promise<Task[]> {
    const params = new URLSearchParams();
    if (query?.status) params.set("status", query.status);
    if (query?.assignee) params.set("assignee", query.assignee);
    if (query?.priority) params.set("priority", query.priority);
    if (query?.label) params.set("label", query.label);
    if (query?.parentId) params.set("parentId", query.parentId);
    if (query?.limit) params.set("limit", String(query.limit));
    if (query?.offset) params.set("offset", String(query.offset));

    const qs = params.toString();
    const url = `${this.baseUrl}/tasks${qs ? `?${qs}` : ""}`;
    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Failed to list tasks (${res.status}): ${body}`);
    }
    return (await res.json()) as Task[];
  }

  async getTask(id: string): Promise<Task | null> {
    const res = await fetch(`${this.baseUrl}/tasks/${id}`, {
      headers: this.headers(),
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Failed to get task (${res.status}): ${body}`);
    }
    return (await res.json()) as Task;
  }

  async updateTask(id: string, input: UpdateTaskInput): Promise<Task | null> {
    const res = await fetch(`${this.baseUrl}/tasks/${id}`, {
      method: "PATCH",
      headers: this.headers(),
      body: JSON.stringify(input),
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Failed to update task (${res.status}): ${body}`);
    }
    return (await res.json()) as Task;
  }

  async deleteTask(id: string): Promise<boolean> {
    const res = await fetch(`${this.baseUrl}/tasks/${id}`, {
      method: "DELETE",
      headers: this.headers(),
    });
    if (res.status === 404) return false;
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Failed to delete task (${res.status}): ${body}`);
    }
    return true;
  }
}
