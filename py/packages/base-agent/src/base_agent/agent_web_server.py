from __future__ import annotations

import asyncio
import dataclasses
import sys
import traceback
import uuid
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from claude_agent_sdk import (
    AssistantMessage,
    ClaudeAgentOptions,
    ClaudeSDKClient,
    ResultMessage,
    SystemMessage,
    TextBlock,
    ThinkingBlock,
    ToolResultBlock,
    ToolUseBlock,
    UserMessage,
)
from fastapi import FastAPI
from pydantic import BaseModel

from .types import AgentEvent, EventSink

DEFAULT_MODEL = "claude-sonnet-4-5-20250929"

ALLOWED_TOOLS = [
    "Skill",
    "Bash",
    "Read",
    "Edit",
    "Write",
    "Glob",
    "Grep",
    "mcp__project-management__create_task",
    "mcp__project-management__list_tasks",
    "mcp__project-management__get_task",
    "mcp__project-management__update_task",
    "mcp__project-management__delete_task",
]


class MessageRequest(BaseModel):
    prompt: str


@dataclass
class AgentWebServerConfig:
    session_id: str
    sink: EventSink
    model: str | None = None


def _serialize_block(block: Any) -> dict[str, Any]:
    """Convert an SDK content block to a JSON-safe dict."""
    if isinstance(block, TextBlock):
        return {"type": "text", "text": block.text}
    if isinstance(block, ThinkingBlock):
        return {"type": "thinking", "thinking": block.thinking}
    if isinstance(block, ToolUseBlock):
        return {"type": "tool_use", "id": block.id, "name": block.name, "input": block.input}
    if isinstance(block, ToolResultBlock):
        return {
            "type": "tool_result",
            "tool_use_id": block.tool_use_id,
            "content": block.content,
            "is_error": block.is_error,
        }
    if dataclasses.is_dataclass(block):
        return dataclasses.asdict(block)
    return {"type": "unknown", "raw": str(block)}


def _serialize_message(message: Any) -> tuple[str, dict[str, Any]]:
    """Convert an SDK message to (event_type, json-safe data dict).

    The data dict must include a ``type`` field matching the event type so
    the web UI's ``extractText`` can identify it (it checks ``data.type``).
    For assistant messages, ``data.message`` must be an object with a
    ``content`` array — mirroring the structure the TS agent produces by
    spreading the raw SDK message.
    """
    if isinstance(message, AssistantMessage):
        serialized_content = [_serialize_block(b) for b in message.content]
        return "assistant", {
            "type": "assistant",
            "message": {"content": serialized_content},
            "model": message.model,
        }

    if isinstance(message, ResultMessage):
        return "result", {
            "type": "result",
            "subtype": "error" if message.is_error else "success",
            "message": "Turn result",
            "session_id": message.session_id,
            "duration_ms": message.duration_ms,
            "duration_api_ms": message.duration_api_ms,
            "is_error": message.is_error,
            "num_turns": message.num_turns,
            "total_cost_usd": message.total_cost_usd,
            "result": message.result,
        }

    if isinstance(message, SystemMessage):
        return "system", {
            "type": "system",
            "subtype": message.subtype,
            **message.data,
        }

    if isinstance(message, UserMessage):
        content = message.content
        if isinstance(content, list):
            content = [_serialize_block(b) for b in content]
        return "user", {"type": "user", "content": content}

    return "unknown", {"type": "unknown", "raw": str(message)}


async def _emit_event(
    sink: EventSink,
    session_id: str,
    event_type: str,
    data: dict[str, Any],
) -> AgentEvent:
    event = AgentEvent(
        id=str(uuid.uuid4()),
        session_id=session_id,
        timestamp=datetime.now(timezone.utc).isoformat(),
        type=event_type,
        data=data,
    )
    await sink.emit(event)
    print(f"[agent] event: {event_type} ({event.id})", flush=True)
    return event


async def _run_session_loop(
    config: AgentWebServerConfig,
    prompt_queue: asyncio.Queue[str],
) -> None:
    """Drive a multi-turn Claude agent session, consuming prompts from the queue."""

    model = config.model or DEFAULT_MODEL
    sink = config.sink
    session_id = config.session_id

    options = ClaudeAgentOptions(
        model=model,
        allowed_tools=ALLOWED_TOOLS,
        permission_mode="bypassPermissions",
        max_turns=50,
        cwd=".",
        setting_sources=["user", "project"],
        stderr=lambda data: print(f"[agent:stderr] {data.rstrip()}", flush=True),
    )

    await _emit_event(sink, session_id, "system", {"message": "Session started"})

    sdk_session_id: str | None = None

    try:
        async with ClaudeSDKClient(options=options) as client:
            while True:
                prompt = await prompt_queue.get()

                print(f"[agent] received prompt: {prompt[:80]}", flush=True)
                await _emit_event(sink, session_id, "user", {"message": prompt})

                await client.query(prompt)
                print("[agent] query sent, waiting for response...", flush=True)

                async for message in client.receive_response():
                    msg_type_name = type(message).__name__
                    print(f"[agent] message: {msg_type_name}", flush=True)

                    # Log SDK init for debugging (skills, MCP, tools)
                    if isinstance(message, SystemMessage) and message.subtype == "init":
                        d = message.data
                        print(f"[agent] SDK init: cwd={d.get('cwd')}", flush=True)
                        print(f"[agent] SDK init: skills={d.get('skills')}", flush=True)
                        print(f"[agent] SDK init: mcp_servers={d.get('mcp_servers')}", flush=True)
                        tools = d.get("tools", [])
                        mcp_tools = [t for t in tools if isinstance(t, str) and (t.startswith("mcp") or t == "Skill")]
                        print(f"[agent] SDK init: skill/mcp tools={mcp_tools}", flush=True)

                    event_type, msg_data = _serialize_message(message)

                    if isinstance(message, ResultMessage) and message.session_id:
                        sdk_session_id = message.session_id

                    if sdk_session_id:
                        msg_data["sdk_session_id"] = sdk_session_id

                    await _emit_event(sink, session_id, event_type, msg_data)

                print("[agent] turn complete", flush=True)
                await _emit_event(
                    sink,
                    session_id,
                    "turn_complete",
                    {
                        "message": "Turn complete",
                        **({"sdk_session_id": sdk_session_id} if sdk_session_id else {}),
                    },
                )
    except Exception:
        print(f"[agent] session loop error:\n{traceback.format_exc()}", flush=True)
        try:
            await _emit_event(sink, session_id, "error", {
                "message": traceback.format_exc(),
            })
        except Exception:
            pass
        raise


def create_app(config: AgentWebServerConfig) -> FastAPI:
    """Create a FastAPI app that accepts prompts via POST and feeds them to the agent session."""

    prompt_queue: asyncio.Queue[str] = asyncio.Queue()
    session_task: asyncio.Task[None] | None = None

    def _on_task_done(task: asyncio.Task[None]) -> None:
        if task.cancelled():
            return
        exc = task.exception()
        if exc:
            print(f"[agent] session task failed: {exc}", file=sys.stderr, flush=True)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        nonlocal session_task
        session_task = asyncio.create_task(_run_session_loop(config, prompt_queue))
        session_task.add_done_callback(_on_task_done)
        yield
        session_task.cancel()
        try:
            await session_task
        except asyncio.CancelledError:
            pass

    app = FastAPI(lifespan=lifespan)

    @app.post("/message")
    async def post_message(body: MessageRequest):
        await prompt_queue.put(body.prompt)
        return {"ok": True}

    @app.get("/health")
    async def health():
        return {"status": "ok"}

    return app
