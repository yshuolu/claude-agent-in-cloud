import type {
  Task,
  TaskStatus,
  TaskPriority,
  TaskQuery,
  CreateTaskInput,
  UpdateTaskInput,
  TaskStore,
} from "@cloud-agent/project-management";

export interface LinearTaskStoreConfig {
  apiKey: string;
  teamId?: string;
  projectId?: string;
}

const LINEAR_API = "https://api.linear.app/graphql";

function linearStateToStatus(stateType: string): TaskStatus {
  switch (stateType) {
    case "started":
      return "in_progress";
    case "completed":
      return "done";
    case "cancelled":
      return "cancelled";
    default:
      return "todo"; // triage, backlog, unstarted
  }
}

function linearPriorityToTask(p: number): TaskPriority {
  switch (p) {
    case 1:
      return "urgent";
    case 2:
      return "high";
    case 3:
      return "medium";
    default:
      return "low"; // 0 (none), 4 (low)
  }
}

function taskPriorityToLinear(p: TaskPriority): number {
  switch (p) {
    case "urgent":
      return 1;
    case "high":
      return 2;
    case "medium":
      return 3;
    case "low":
      return 4;
  }
}

function statusToStateType(status: TaskStatus): string {
  switch (status) {
    case "in_progress":
    case "in_review":
      return "started";
    case "done":
      return "completed";
    case "cancelled":
      return "cancelled";
    default:
      return "unstarted";
  }
}

interface WorkflowState {
  id: string;
  name: string;
  type: string;
}

interface LinearLabel {
  id: string;
  name: string;
}

const ISSUE_FIELDS = `
  id
  title
  description
  priority
  createdAt
  updatedAt
  state { id name type }
  assignee { id }
  labels { nodes { id name } }
  parent { id }
`;

export class LinearTaskStore implements TaskStore {
  private apiKey: string;
  private teamId: string | null;
  private projectId: string | null;
  private workflowStates: WorkflowState[] | null = null;
  private labelCache: Map<string, string> = new Map(); // name → id

  constructor(config: LinearTaskStoreConfig) {
    this.apiKey = config.apiKey;
    this.teamId = config.teamId ?? null;
    this.projectId = config.projectId ?? null;
  }

  private async graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const res = await fetch(LINEAR_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: this.apiKey,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!res.ok) {
      throw new Error(`Linear API error: ${res.status} ${res.statusText}`);
    }

    const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
    if (json.errors?.length) {
      throw new Error(`Linear GraphQL error: ${json.errors.map((e) => e.message).join(", ")}`);
    }
    return json.data as T;
  }

  private async ensureTeamId(): Promise<string> {
    if (this.teamId) return this.teamId;

    const data = await this.graphql<{ teams: { nodes: { id: string }[] } }>(
      `query { teams { nodes { id } } }`
    );

    if (!data.teams.nodes.length) {
      throw new Error("No teams found in Linear workspace");
    }

    this.teamId = data.teams.nodes[0].id;
    return this.teamId;
  }

  private async getWorkflowStates(): Promise<WorkflowState[]> {
    if (this.workflowStates) return this.workflowStates;

    const teamId = await this.ensureTeamId();
    const data = await this.graphql<{
      team: { states: { nodes: WorkflowState[] } };
    }>(
      `query($teamId: String!) {
        team(id: $teamId) {
          states { nodes { id name type } }
        }
      }`,
      { teamId }
    );

    this.workflowStates = data.team.states.nodes;
    return this.workflowStates;
  }

  private async resolveStateId(status: TaskStatus): Promise<string> {
    const states = await this.getWorkflowStates();
    const targetType = statusToStateType(status);
    const match = states.find((s) => s.type === targetType);
    if (!match) {
      throw new Error(`No workflow state found for type "${targetType}"`);
    }
    return match.id;
  }

  private async resolveLabelIds(names: string[]): Promise<string[]> {
    const missing = names.filter((n) => !this.labelCache.has(n));

    if (missing.length) {
      const teamId = await this.ensureTeamId();
      const data = await this.graphql<{
        issueLabels: { nodes: LinearLabel[] };
      }>(
        `query($teamId: ID) {
          issueLabels(filter: { team: { id: { eq: $teamId } } }) {
            nodes { id name }
          }
        }`,
        { teamId }
      );

      for (const label of data.issueLabels.nodes) {
        this.labelCache.set(label.name, label.id);
      }
    }

    return names
      .map((n) => this.labelCache.get(n))
      .filter((id): id is string => id != null);
  }

  private issueToTask(issue: Record<string, unknown>): Task {
    const state = issue.state as { type: string } | null;
    const assignee = issue.assignee as { id: string } | null;
    const labels = issue.labels as { nodes: { name: string }[] } | null;
    const parent = issue.parent as { id: string } | null;

    return {
      id: issue.id as string,
      title: issue.title as string,
      description: (issue.description as string) ?? "",
      status: state ? linearStateToStatus(state.type) : "todo",
      assignee: assignee?.id ?? null,
      priority: linearPriorityToTask(issue.priority as number),
      labels: labels?.nodes.map((l) => l.name) ?? [],
      parentId: parent?.id ?? null,
      createdAt: issue.createdAt as string,
      updatedAt: issue.updatedAt as string,
    };
  }

  async create(input: CreateTaskInput): Promise<Task> {
    const teamId = await this.ensureTeamId();

    const vars: Record<string, unknown> = {
      teamId,
      title: input.title,
    };

    if (this.projectId) vars.projectId = this.projectId;
    if (input.description != null) vars.description = input.description;
    if (input.assignee != null) vars.assigneeId = input.assignee;
    if (input.priority != null) vars.priority = taskPriorityToLinear(input.priority);
    if (input.parentId != null) vars.parentId = input.parentId;

    if (input.status != null) {
      vars.stateId = await this.resolveStateId(input.status);
    }

    if (input.labels?.length) {
      vars.labelIds = await this.resolveLabelIds(input.labels);
    }

    const data = await this.graphql<{
      issueCreate: { issue: Record<string, unknown> };
    }>(
      `mutation($teamId: String!, $title: String!, $description: String, $assigneeId: String, $priority: Int, $parentId: String, $stateId: String, $labelIds: [String!], $projectId: String) {
        issueCreate(input: {
          teamId: $teamId
          title: $title
          description: $description
          assigneeId: $assigneeId
          priority: $priority
          parentId: $parentId
          stateId: $stateId
          labelIds: $labelIds
          projectId: $projectId
        }) {
          issue { ${ISSUE_FIELDS} }
        }
      }`,
      vars
    );

    return this.issueToTask(data.issueCreate.issue);
  }

  async get(id: string): Promise<Task | null> {
    try {
      const data = await this.graphql<{ issue: Record<string, unknown> }>(
        `query($id: String!) {
          issue(id: $id) { ${ISSUE_FIELDS} }
        }`,
        { id }
      );
      return data.issue ? this.issueToTask(data.issue) : null;
    } catch {
      return null;
    }
  }

  async list(query?: TaskQuery): Promise<Task[]> {
    const teamId = await this.ensureTeamId();
    const limit = query?.limit ?? 50;

    // Build server-side filter
    const filterParts: string[] = [`team: { id: { eq: $teamId } }`];
    const vars: Record<string, unknown> = { teamId, first: limit };

    if (this.projectId) {
      filterParts.push(`project: { id: { eq: $projectId } }`);
      vars.projectId = this.projectId;
    }

    if (query?.assignee) {
      filterParts.push(`assignee: { id: { eq: $assigneeId } }`);
      vars.assigneeId = query.assignee;
    }

    if (query?.priority) {
      filterParts.push(`priority: { eq: $priority }`);
      vars.priority = taskPriorityToLinear(query.priority);
    }

    if (query?.parentId) {
      filterParts.push(`parent: { id: { eq: $parentId } }`);
      vars.parentId = query.parentId;
    }

    const filterStr = filterParts.join(", ");

    // Build variable declarations
    const varDecls = [
      "$teamId: ID!",
      "$first: Int",
      ...(this.projectId ? ["$projectId: ID"] : []),
      ...(query?.assignee ? ["$assigneeId: ID"] : []),
      ...(query?.priority ? ["$priority: Int"] : []),
      ...(query?.parentId ? ["$parentId: ID"] : []),
    ].join(", ");

    const data = await this.graphql<{
      issues: { nodes: Record<string, unknown>[] };
    }>(
      `query(${varDecls}) {
        issues(first: $first, filter: { ${filterStr} }) {
          nodes { ${ISSUE_FIELDS} }
        }
      }`,
      vars
    );

    let tasks = data.issues.nodes.map((n) => this.issueToTask(n));

    // Client-side filtering for fields not easily filtered server-side
    if (query?.status) {
      tasks = tasks.filter((t) => t.status === query.status);
    }

    if (query?.label) {
      tasks = tasks.filter((t) => t.labels.includes(query.label!));
    }

    if (query?.offset) {
      tasks = tasks.slice(query.offset);
    }

    return tasks;
  }

  async update(id: string, input: UpdateTaskInput): Promise<Task | null> {
    const vars: Record<string, unknown> = { id };

    if (input.title != null) vars.title = input.title;
    if (input.description != null) vars.description = input.description;
    if (input.priority != null) vars.priority = taskPriorityToLinear(input.priority);
    if (input.parentId !== undefined) vars.parentId = input.parentId;

    if (input.assignee !== undefined) {
      vars.assigneeId = input.assignee;
    }

    if (input.status != null) {
      vars.stateId = await this.resolveStateId(input.status);
    }

    if (input.labels != null) {
      vars.labelIds = await this.resolveLabelIds(input.labels);
    }

    try {
      const data = await this.graphql<{
        issueUpdate: { issue: Record<string, unknown> };
      }>(
        `mutation($id: String!, $title: String, $description: String, $assigneeId: String, $priority: Int, $parentId: String, $stateId: String, $labelIds: [String!]) {
          issueUpdate(id: $id, input: {
            title: $title
            description: $description
            assigneeId: $assigneeId
            priority: $priority
            parentId: $parentId
            stateId: $stateId
            labelIds: $labelIds
          }) {
            issue { ${ISSUE_FIELDS} }
          }
        }`,
        vars
      );
      return this.issueToTask(data.issueUpdate.issue);
    } catch {
      return null;
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      const data = await this.graphql<{
        issueDelete: { success: boolean };
      }>(
        `mutation($id: String!) {
          issueDelete(id: $id) { success }
        }`,
        { id }
      );
      return data.issueDelete.success;
    } catch {
      return false;
    }
  }

  close(): void {
    // No connections to close
  }
}
