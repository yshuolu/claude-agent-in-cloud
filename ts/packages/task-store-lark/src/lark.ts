import type {
  Task,
  TaskStore,
  TaskQuery,
  CreateTaskInput,
  UpdateTaskInput,
  TaskStatus,
  TaskPriority,
} from "@cloud-agent/project-management/types";

export interface LarkTaskStoreConfig {
  appId: string;
  appSecret: string;
  baseUrl?: string;
}

interface TokenCache {
  token: string;
  expiresAt: number;
}

interface LarkExtra {
  status?: TaskStatus;
  priority?: TaskPriority;
  labels?: string[];
}

interface LarkMember {
  id: string;
  type: string;
  role: string;
}

interface LarkTask {
  guid: string;
  summary: string;
  description?: string;
  completed_at?: string;
  members?: LarkMember[];
  extra?: string;
  created_at?: string;
  updated_at?: string;
  subtask_guids?: string[];
}

interface LarkResponse<T> {
  code: number;
  msg: string;
  data: T;
}

const DEFAULT_BASE_URL = "https://open.larksuite.com";
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000; // refresh 5 min before expiry

export class LarkTaskStore implements TaskStore {
  private config: Required<LarkTaskStoreConfig>;
  private tokenCache: TokenCache | null = null;

  constructor(config: LarkTaskStoreConfig) {
    this.config = {
      appId: config.appId,
      appSecret: config.appSecret,
      baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,
    };
  }

  private async getToken(): Promise<string> {
    if (
      this.tokenCache &&
      Date.now() < this.tokenCache.expiresAt - TOKEN_REFRESH_MARGIN_MS
    ) {
      return this.tokenCache.token;
    }

    const res = await fetch(
      `${this.config.baseUrl}/open-apis/auth/v3/tenant_access_token/internal`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          app_id: this.config.appId,
          app_secret: this.config.appSecret,
        }),
      },
    );

    if (!res.ok) {
      throw new Error(`Failed to obtain Lark token: ${res.status}`);
    }

    const data = (await res.json()) as {
      code: number;
      msg: string;
      tenant_access_token: string;
      expire: number;
    };

    if (data.code !== 0) {
      throw new Error(`Lark auth error: ${data.msg}`);
    }

    this.tokenCache = {
      token: data.tenant_access_token,
      expiresAt: Date.now() + data.expire * 1000,
    };

    return this.tokenCache.token;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const token = await this.getToken();
    const url = `${this.config.baseUrl}/open-apis/task/v2${path}`;

    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      throw new Error(`Lark API error: ${method} ${path} → ${res.status}`);
    }

    const json = (await res.json()) as LarkResponse<T>;
    if (json.code !== 0) {
      throw new Error(`Lark API error: ${json.msg}`);
    }

    return json.data;
  }

  private parseExtra(extraStr?: string): LarkExtra {
    if (!extraStr) return {};
    try {
      return JSON.parse(extraStr) as LarkExtra;
    } catch {
      return {};
    }
  }

  private buildExtra(extra: LarkExtra): string {
    return JSON.stringify(extra);
  }

  private larkToTask(lark: LarkTask): Task {
    const extra = this.parseExtra(lark.extra);
    const assigneeMember = lark.members?.find((m) => m.role === "assignee");

    let status: TaskStatus;
    if (lark.completed_at) {
      status = "done";
    } else {
      status = extra.status ?? "todo";
    }

    return {
      id: lark.guid,
      title: lark.summary,
      description: lark.description ?? "",
      status,
      assignee: assigneeMember?.id ?? null,
      priority: extra.priority ?? "medium",
      labels: extra.labels ?? [],
      parentId: null,
      createdAt: lark.created_at
        ? new Date(parseInt(lark.created_at, 10)).toISOString()
        : new Date().toISOString(),
      updatedAt: lark.updated_at
        ? new Date(parseInt(lark.updated_at, 10)).toISOString()
        : new Date().toISOString(),
    };
  }

  async create(input: CreateTaskInput): Promise<Task> {
    const extra: LarkExtra = {
      status: input.status ?? "todo",
      priority: input.priority ?? "medium",
      labels: input.labels ?? [],
    };

    const body: Record<string, unknown> = {
      summary: input.title,
      description: input.description ?? "",
      extra: this.buildExtra(extra),
    };

    if (input.assignee) {
      body.members = [{ id: input.assignee, type: "user", role: "assignee" }];
    }

    if (input.status === "done") {
      body.completed_at = String(Date.now());
    }

    let data: { task: LarkTask };
    if (input.parentId) {
      data = await this.request<{ task: LarkTask }>(
        "POST",
        `/tasks/${input.parentId}/subtasks`,
        body,
      );
    } else {
      data = await this.request<{ task: LarkTask }>("POST", "/tasks", body);
    }

    const task = this.larkToTask(data.task);
    if (input.parentId) {
      task.parentId = input.parentId;
    }
    return task;
  }

  async get(id: string): Promise<Task | null> {
    try {
      const data = await this.request<{ task: LarkTask }>(
        "GET",
        `/tasks/${id}`,
      );
      return this.larkToTask(data.task);
    } catch {
      return null;
    }
  }

  async list(query?: TaskQuery): Promise<Task[]> {
    const params = new URLSearchParams();
    if (query?.limit) params.set("page_size", String(query.limit));
    if (query?.offset) params.set("page_token", String(query.offset));

    const qs = params.toString();
    const path = `/tasks${qs ? `?${qs}` : ""}`;

    // Note: list endpoint returns empty with tenant_access_token.
    // Requires user_access_token for actual results.
    const data = await this.request<{
      items?: LarkTask[];
      page_token?: string;
    }>("GET", path);

    let tasks = (data.items ?? []).map((t) => this.larkToTask(t));

    // Client-side filtering since Lark doesn't support these filters natively
    if (query?.status) {
      tasks = tasks.filter((t) => t.status === query.status);
    }
    if (query?.assignee) {
      tasks = tasks.filter((t) => t.assignee === query.assignee);
    }
    if (query?.priority) {
      tasks = tasks.filter((t) => t.priority === query.priority);
    }
    if (query?.label) {
      tasks = tasks.filter((t) => t.labels.includes(query.label!));
    }
    if (query?.parentId) {
      tasks = tasks.filter((t) => t.parentId === query.parentId);
    }

    return tasks;
  }

  async update(id: string, input: UpdateTaskInput): Promise<Task | null> {
    const existing = await this.get(id);
    if (!existing) return null;

    const existingExtra: LarkExtra = {
      status: existing.status,
      priority: existing.priority,
      labels: existing.labels,
    };

    const body: Record<string, unknown> = {};
    const updateFields: string[] = [];

    if (input.title !== undefined) {
      body.summary = input.title;
      updateFields.push("summary");
    }
    if (input.description !== undefined) {
      body.description = input.description;
      updateFields.push("description");
    }

    // Update extra fields
    let extraChanged = false;
    if (input.status !== undefined) {
      existingExtra.status = input.status;
      extraChanged = true;
      if (input.status === "done") {
        body.completed_at = String(Date.now());
        updateFields.push("completed_at");
      }
    }
    if (input.priority !== undefined) {
      existingExtra.priority = input.priority;
      extraChanged = true;
    }
    if (input.labels !== undefined) {
      existingExtra.labels = input.labels;
      extraChanged = true;
    }
    if (extraChanged) {
      body.extra = this.buildExtra(existingExtra);
      updateFields.push("extra");
    }

    if (input.assignee !== undefined) {
      body.members = input.assignee
        ? [{ id: input.assignee, type: "user", role: "assignee" }]
        : [];
      updateFields.push("members");
    }

    if (updateFields.length === 0) return existing;

    body.update_fields = updateFields;

    const data = await this.request<{ task: LarkTask }>(
      "PATCH",
      `/tasks/${id}`,
      body,
    );
    return this.larkToTask(data.task);
  }

  async delete(id: string): Promise<boolean> {
    try {
      await this.request("DELETE", `/tasks/${id}`);
      return true;
    } catch {
      return false;
    }
  }

  close(): void {
    this.tokenCache = null;
  }
}
