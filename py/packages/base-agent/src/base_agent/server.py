from __future__ import annotations

from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from pydantic import BaseModel

from .base_agent import AgentSession, AgentSessionConfig
from .runner import AgentRunner
from .types import EventSink


class MessageRequest(BaseModel):
    prompt: str


def create_app(config: AgentSessionConfig, sink: EventSink) -> FastAPI:
    """Create a FastAPI app that owns the AgentSession lifecycle
    and uses an AgentRunner to process prompts."""

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        async with AgentSession(config) as session:
            runner = AgentRunner(session, sink)
            app.state.runner = runner
            await runner.start()
            yield
            await runner.stop()

    app = FastAPI(lifespan=lifespan)

    @app.post("/message")
    async def post_message(body: MessageRequest):
        app.state.runner.submit(body.prompt)
        return {"ok": True}

    @app.get("/health")
    async def health():
        return {"status": "ok"}

    return app


def run_server(
    config: AgentSessionConfig,
    sink: EventSink,
    host: str = "0.0.0.0",
    port: int = 9100,
) -> None:
    """Create the FastAPI app and run it with uvicorn."""
    app = create_app(config, sink)
    print(f"[agent] starting on {host}:{port}")
    uvicorn.run(app, host=host, port=port)
