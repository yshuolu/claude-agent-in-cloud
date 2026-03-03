import Database from "better-sqlite3";
import type { AgentRecord, AgentStore } from "./types.js";

interface AgentRow {
  id: string;
  session_id: string;
  status: string;
  auth_token: string;
  connection_url: string;
  created_at: string;
  stopped_at: string | null;
}

function rowToRecord(row: AgentRow): AgentRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    status: row.status as AgentRecord["status"],
    authToken: row.auth_token,
    connectionUrl: row.connection_url,
    createdAt: row.created_at,
    stoppedAt: row.stopped_at,
  };
}

export class SqliteAgentStore implements AgentStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'running',
        auth_token TEXT NOT NULL,
        connection_url TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        stopped_at TEXT
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_auth_token ON agents(auth_token);
      CREATE INDEX IF NOT EXISTS idx_agents_session_id ON agents(session_id);
    `);

    // Migration for existing DBs missing the connection_url column
    const columns = this.db.pragma("table_info(agents)") as Array<{ name: string }>;
    if (!columns.some((c) => c.name === "connection_url")) {
      this.db.exec("ALTER TABLE agents ADD COLUMN connection_url TEXT NOT NULL DEFAULT ''");
    }
  }

  save(record: AgentRecord): void {
    this.db
      .prepare(
        `INSERT INTO agents (id, session_id, status, auth_token, connection_url, created_at, stopped_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        record.id,
        record.sessionId,
        record.status,
        record.authToken,
        record.connectionUrl,
        record.createdAt,
        record.stoppedAt,
      );
  }

  get(id: string): AgentRecord | null {
    const row = this.db
      .prepare("SELECT * FROM agents WHERE id = ?")
      .get(id) as AgentRow | undefined;
    return row ? rowToRecord(row) : null;
  }

  getByToken(token: string): AgentRecord | null {
    const row = this.db
      .prepare("SELECT * FROM agents WHERE auth_token = ?")
      .get(token) as AgentRow | undefined;
    return row ? rowToRecord(row) : null;
  }

  updateStatus(id: string, status: AgentRecord["status"]): void {
    const stoppedAt =
      status === "stopped" || status === "error"
        ? new Date().toISOString()
        : null;
    this.db
      .prepare("UPDATE agents SET status = ?, stopped_at = ? WHERE id = ?")
      .run(status, stoppedAt, id);
  }

  listBySession(sessionId: string): AgentRecord[] {
    const rows = this.db
      .prepare("SELECT * FROM agents WHERE session_id = ? ORDER BY created_at DESC")
      .all(sessionId) as AgentRow[];
    return rows.map(rowToRecord);
  }

  close(): void {
    this.db.close();
  }
}
