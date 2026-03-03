# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Mission

Host Claude Code agents in the cloud so users can remotely start tasks and get real-time feedback through a web UI. The system manages agent lifecycles, persists all events, and provides memory continuity across sessions.

**Core user flow:** User opens web UI → starts a task → a remote Claude Code agent executes it → events stream back to the UI in real time → results and context persist for future sessions.

## Architecture

Turborepo monorepo (all TypeScript):

```
├── ts/
│   ├── apps/
│   │   ├── web/                # React UI for task submission & live feedback
│   │   └── server/             # API server (REST + SSE streaming)
│   ├── packages/
│   │   ├── base-agent/         # Core agent session logic + EventSink interface
│   │   ├── agent-local/        # Local dev entry point (HttpEventSink wiring)
│   │   ├── event-store/        # Event persistence layer (in-memory)
│   │   ├── memory-service/     # Agent memory / context management (in-memory)
│   │   ├── agent-manager/      # Agent lifecycle (spawn, monitor, stop)
│   │   └── shared/             # Shared types and utilities
│   ├── turbo.json              # Turborepo pipeline configuration
│   ├── package.json            # Root package.json with workspaces
│   └── tsconfig.base.json      # Shared TypeScript config
├── docker/
│   ├── Dockerfile.agent        # Claude Code agent runner image
│   ├── Dockerfile.server       # API server image
│   └── docker-compose.yml      # Full stack orchestration
└── CLAUDE.md
```

### Event Flow

```
Agent process --HTTP POST--> /sessions/:id/events --> InMemoryEventStore
                                                          |
                                                     subscribe()
                                                          |
                                                     SSE stream --> Browser
```

### Design Principles

- Packages are **independent** — they define their own types/interfaces and do not import from each other. Integration happens at the app level through adapters.
- **Event-sourced** — all agent activity is captured as an ordered event stream, enabling replay, debugging, and real-time UI updates.
- **Stateless API, stateful agents** — the API server is horizontally scalable; agent state lives in the event store and memory service.

### Code Guidelines

- **Interface-first** — every service boundary must be defined as a TypeScript interface (`EventStore`, `MemoryService`, `AgentRunner`, `EventSink`, etc.). Packages export interfaces and implementations separately. No module should depend on a concrete class it doesn't own.
- **Dependency injection over direct imports** — packages and library code depend only on interfaces. Concrete implementations are wired together at the app level (see `services.ts`). Use dynamic `import()` or factory functions so the top-level module graph stays free of heavy transitive dependencies.
- **Minimal dependencies** — add a dependency only when it provides clear value over a small amount of hand-written code. Prefer Node built-ins and the standard library. Audit `package.json` before adding anything — if a similar capability already exists in the dependency tree, use it.
- **Lean Docker images** — use Alpine base images. Keep the runtime stage clean. Never copy `devDependencies` or test fixtures into production images.

## Packages

### base-agent (`ts/packages/base-agent/`)

Core agent session library. Defines `EventSink` interface (write-only, async `emit()`) and `AgentEvent` type. Exports `runAgentSession()` which drives the Claude Agent SDK and emits events through the sink. Has no knowledge of transport — the sink implementation determines how events are delivered.

### agent-local (`ts/packages/agent-local/`)

Local/Docker entry point for running agents. Reads env vars (`SERVER_URL`, `AGENT_PROMPT`, `AGENT_SESSION_ID`, etc.), creates an `HttpEventSink` that POSTs events to the server, and calls `runAgentSession()` from `base-agent`. Not used in cloud deployments where a different sink/entry point would be used.

### event-store (`ts/packages/event-store/`)

Abstract event store interface for persisting and retrieving events. Defines `EventStore` interface with `append`, `getEvents`, `subscribe` methods. Currently uses `InMemoryEventStore`.

### api server (`ts/apps/server/`)

REST API for session events and SSE streaming. The server loads `.env` from the project root via dotenv.

Key endpoints:
- `POST /sessions` — create a new agent session
- `POST /sessions/{id}/tasks` — submit a task to a session
- `POST /sessions/{id}/events` — agent event ingestion (used by HttpEventSink)
- `GET /sessions/{id}/events` — SSE stream of session events
- `GET /sessions/{id}` — session status and metadata
- `DELETE /sessions/{id}` — stop and clean up a session

### memory-service (`ts/packages/memory-service/`)

Manages persistent context and memory for agents across sessions. Uses `InMemoryMemoryService`. Provides:
- Session-scoped memory (conversation context within a task)
- Project-scoped memory (knowledge that persists across tasks in the same project)
- Memory retrieval by relevance for agent context injection

### agent-manager (`ts/packages/agent-manager/`)

Manages the full agent lifecycle:
- **Spawn** — start a Claude Code agent process (local subprocess or Docker container)
- **Monitor** — track agent health, capture stdout/stderr as events
- **Stop** — graceful shutdown with timeout, then force kill
- **Resume** — restart an agent with prior context from memory service

Defines `AgentRunner` interface so backends (subprocess, Docker, Fly.io) are swappable.

## Docker Setup

### Development

```bash
docker compose -f docker/docker-compose.yml up    # Start full stack
docker compose -f docker/docker-compose.yml up -d  # Detached mode
docker compose -f docker/docker-compose.yml down   # Tear down
```

### Images

- **server** — Node.js API server. Exposes port 8000. Requires `ANTHROPIC_API_KEY` env var.
- **agent** — Claude Code runner. Each agent task spawns a container from this image.
- **web** — Static frontend served by nginx. Connects to the API server via reverse proxy.

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | API key for Claude |
| `AGENT_RUNNER` | No | Agent backend: `subprocess` (local dev), `docker` (default), `flyio` |
| `SERVER_URL` | No | URL agents use to POST events back (default: `http://localhost:8000`) |
| `CORS_ORIGINS` | No | Allowed CORS origins (default: `http://localhost:3000`) |

## Remote Access

The system is designed for remote operation:
- API server exposes a REST + SSE interface — any HTTP client can interact with it
- Web UI connects over HTTPS in production (reverse proxy with TLS termination)
- Agent processes run server-side; no local Claude Code installation needed on the client
- SSE provides real-time streaming of agent output to the browser

## Common Commands

All commands run from `ts/` directory.

### Environment Setup
```bash
cd ts && npm install              # Install all workspace dependencies
```

### Development
```bash
cd ts && npx turbo dev                                   # Run all apps in dev mode
cd ts && npx turbo dev --filter=@cloud-agent/web         # Run only the web app
cd ts && npx turbo dev --filter=@cloud-agent/server      # Run only the API server
```

### Building
```bash
cd ts && npx turbo build          # Build all packages and apps
cd ts && npx turbo build --filter=<pkg>    # Build a specific package/app
```

### Testing
```bash
cd ts && npx turbo test           # Run all tests
cd ts && npx turbo test --filter=<pkg>     # Run tests for specific package
```

### Linting and Formatting
```bash
cd ts && npx turbo lint           # Lint all packages
cd ts && npx turbo format         # Format all packages
```

### Type Checking
```bash
cd ts && npx turbo typecheck      # Type check all packages
```

### Adding Dependencies
```bash
cd ts/apps/<app> && npm install <dep>          # Add to a specific app
cd ts/packages/<pkg> && npm install <dep>      # Add to a specific package
```
