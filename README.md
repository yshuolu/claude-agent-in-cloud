# Cloud Agent

Host Claude Code agents in the cloud. Start tasks via API or web UI, get real-time streaming feedback via SSE, and persist events and memory across sessions.

## Prerequisites

- Node.js 22+
- npm 10+
- An [Anthropic API key](https://console.anthropic.com/)
- Docker & Docker Compose (optional, for containerized deployment)

## Local Development Setup

### 1. Clone and configure

```bash
git clone <repo-url> && cd claude-agent-in-cloud
cp .env.example .env
# Edit .env and set your ANTHROPIC_API_KEY
```

Your `.env` should contain:

```
ANTHROPIC_API_KEY=sk-ant-...
AGENT_RUNNER=subprocess
```

### 2. Install dependencies

```bash
cd ts
npm install
```

### 3. Build all packages

```bash
npx turbo build
```

### 4. Run in dev mode

```bash
npx turbo dev
```

This starts:
- **API server** on `http://localhost:8000`
- **Web UI** on `http://localhost:3000`

To run individually:

```bash
npx turbo dev --filter=@cloud-agent/server    # API server only
npx turbo dev --filter=@cloud-agent/web       # Web UI only
```

### 5. Run tests

```bash
npx turbo test
```

### 6. Type check

```bash
npx turbo typecheck
```

## Testing the API (curl)

### Create a session

```bash
SESSION=$(curl -s -X POST http://localhost:8000/sessions | jq -r '.id')
echo "Session: $SESSION"
```

With a project ID (for cross-session memory):

```bash
SESSION=$(curl -s -X POST http://localhost:8000/sessions \
  -H "Content-Type: application/json" \
  -d '{"projectId": "my-project"}' | jq -r '.id')
```

### Submit a task

```bash
curl -X POST http://localhost:8000/sessions/$SESSION/tasks \
  -H "Content-Type: application/json" \
  -d '{"prompt": "What is 2+2?"}'
```

With memory resume (injects context from prior sessions in the same project):

```bash
curl -X POST http://localhost:8000/sessions/$SESSION/tasks \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Continue where we left off", "resume": true}'
```

### Stream events (SSE)

```bash
curl -N http://localhost:8000/sessions/$SESSION/events
```

Events are sent as SSE with typed event names: `system`, `assistant`, `user`, `result`, `error`, `done`.

Supports `Last-Event-ID` header for replay from a specific point.

### Check session status

```bash
curl http://localhost:8000/sessions/$SESSION
```

### Delete a session

```bash
curl -X DELETE http://localhost:8000/sessions/$SESSION
```

## Testing the Web UI

1. Open `http://localhost:3000`
2. Click **+ New Session** in the sidebar
3. Type a prompt in the input box and click **Run**
4. Watch the agent's output stream in real time

## Architecture

Turborepo monorepo, all TypeScript.

```
ts/
  apps/
    server/            # Hono REST API + SSE streaming (port 8000)
    web/               # React frontend (port 3000)
  packages/
    base-agent/        # Core agent session logic + EventSink interface
    agent-local/       # Local dev entry point: wires HttpEventSink -> base-agent
    event-store/       # EventStore interface + InMemoryEventStore
    memory-service/    # MemoryService interface + InMemoryMemoryService
    agent-manager/     # AgentRunner interface (subprocess / Docker / Fly.io)
    shared/            # Shared types (Session, AgentEvent, etc.)
docker/
  Dockerfile.agent     # Agent runner image
  Dockerfile.server    # API server image
  docker-compose.yml   # Full stack orchestration
```

### Event Flow

```
Agent process --HTTP POST--> /sessions/:id/events --> InMemoryEventStore
                                                          |
                                                     subscribe()
                                                          |
                                                     SSE stream --> Browser
```

The agent runs as a separate process and sends events to the server via HTTP POST. The server appends them to the in-memory event store, which triggers subscriber callbacks that push events to connected SSE clients in real time.

### Packages

- **`base-agent`** -- Library. Defines `EventSink` interface and `runAgentSession()`. No knowledge of transport.
- **`agent-local`** -- App entry point for local/Docker dev. Reads env vars, creates `HttpEventSink`, calls `runAgentSession()`.
- **`event-store`** -- `EventStore` interface with `append`, `getEvents`, `subscribe`. In-memory implementation.
- **`memory-service`** -- `MemoryService` interface with `store`, `retrieve`. In-memory implementation. Includes `extractMemories()` for deriving facts from agent events.
- **`agent-manager`** -- `AgentRunner` interface with `spawn`. Backends: `SubprocessRunner`, `DockerRunner`, `FlyRunner`.
- **`shared`** -- TypeScript types: `Session`, `SessionStatus`, `TaskRequest`, `AgentEvent`.

## Docker

```bash
docker compose -f docker/docker-compose.yml up --build   # Start full stack
docker compose -f docker/docker-compose.yml down          # Tear down
```

Requires a `.env` file with `ANTHROPIC_API_KEY` at the project root.

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | -- | Anthropic API key |
| `AGENT_RUNNER` | No | `docker` | Agent backend: `subprocess`, `docker`, `flyio` |
| `SERVER_URL` | No | `http://localhost:8000` | URL agents use to POST events back |
| `CLAUDE_MODEL` | No | `claude-sonnet-4-5-20250929` | Model for agents |
| `CORS_ORIGINS` | No | `http://localhost:3000` | Comma-separated allowed origins |
| `PORT` | No | `8000` | Server listen port |

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `POST` | `/sessions` | Create session. Body: `{"projectId": "..."}` (optional) |
| `GET` | `/sessions` | List all sessions |
| `GET` | `/sessions/:id` | Get session status |
| `DELETE` | `/sessions/:id` | Stop and delete session |
| `POST` | `/sessions/:id/tasks` | Submit task. Body: `{"prompt": "...", "resume": true}` |
| `POST` | `/sessions/:id/events` | Agent event ingestion |
| `GET` | `/sessions/:id/events` | SSE stream (or JSON with `?limit=N`) |

## License

MIT
