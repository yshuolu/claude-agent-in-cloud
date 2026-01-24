# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A minimalist design for hosting Claude agents remotely with web interface access.

## Architecture

Polyglot monorepo structure:
- `py/` - Python backend (uv workspace)
- `ts/` - TypeScript web frontend (planned)

### Python (`py/`)

uv-based workspace with:
- `py/packages/` - Shared libraries and reusable components
- `py/apps/` - Deployable applications

### Design Principles

Packages are designed to be **independent** - they define their own protocols/interfaces and do not import from each other. Integration happens at the app level through adapters.

### Packages

- **event-store** (`py/packages/event_store/`) - Abstract event store interface for persisting and retrieving events. Defines `EventStore` protocol with `append`, `get_events`, `subscribe` methods.

- **api** (`py/packages/api/`) - REST API for session events and SSE streaming. Defines its own `EventSource` protocol for dependency injection. Use `create_router(get_event_source)` to create the FastAPI router.

## Common Commands

All Python commands run from `py/` directory.

### Environment Setup
```bash
cd py && uv sync --all-packages   # Sync all workspace packages
```

### Running Applications
```bash
cd py && uv run python -m <app_name>       # Run an application
cd py && uv run --package <pkg> <command>  # Run command in specific package context
```

### Testing
```bash
cd py && uv run pytest                     # Run all tests
cd py && uv run pytest packages/<pkg>      # Run tests for specific package
cd py && uv run pytest -k "test_name"      # Run specific test by name
```

### Linting and Formatting
```bash
cd py && uv run ruff check .               # Lint code
cd py && uv run ruff format .              # Format code
cd py && uv run ruff check --fix .         # Auto-fix lint issues
```

### Type Checking
```bash
cd py && uv run pyright                    # Run type checker
```

### Adding Dependencies
```bash
cd py && uv add <package>                  # Add to root
cd py && uv add --package <pkg> <dep>      # Add to specific workspace package
```
