from __future__ import annotations

import dataclasses
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, AsyncGenerator

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

from .prompt import SYSTEM_PROMPT
from .types import AgentEvent

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
    "mcp__communicate__send_message",
    "mcp__communicate__mark_end",
]


@dataclass
class AgentSessionConfig:
    session_id: str
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


def _make_event(session_id: str, event_type: str, data: dict[str, Any]) -> AgentEvent:
    return AgentEvent(
        id=str(uuid.uuid4()),
        session_id=session_id,
        timestamp=datetime.now(timezone.utc).isoformat(),
        type=event_type,
        data=data,
    )


class AgentSession:
    """A multi-turn Claude agent session.

    Use as an async context manager to manage the SDK client lifecycle.
    Call ``request(prompt)`` to send a prompt and iterate over the yielded events.
    """

    def __init__(self, config: AgentSessionConfig) -> None:
        self._config = config
        self._session_id = config.session_id
        self._model = config.model or DEFAULT_MODEL
        self._sdk_session_id: str | None = None
        self._client: ClaudeSDKClient | None = None

    async def __aenter__(self) -> AgentSession:
        options = ClaudeAgentOptions(
            model=self._model,
            system_prompt=SYSTEM_PROMPT,
            allowed_tools=ALLOWED_TOOLS,
            permission_mode="bypassPermissions",
            max_turns=50,
            cwd=".",
            setting_sources=["user", "project"],
            stderr=lambda data: print(f"[agent:stderr] {data.rstrip()}", flush=True),
        )
        self._client = ClaudeSDKClient(options=options)
        await self._client.__aenter__()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        if self._client:
            await self._client.__aexit__(exc_type, exc_val, exc_tb)
            self._client = None

    async def request(self, prompt: str) -> AsyncGenerator[AgentEvent, None]:
        """Send a prompt and yield AgentEvent objects as the agent responds."""
        assert self._client is not None, "AgentSession must be used as an async context manager"

        print(f"[agent] received prompt: {prompt[:80]}", flush=True)
        yield _make_event(self._session_id, "user", {"message": prompt})

        await self._client.query(prompt)
        print("[agent] query sent, waiting for response...", flush=True)

        async for message in self._client.receive_response():
            msg_type_name = type(message).__name__
            print(f"[agent] message: {msg_type_name}", flush=True)

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
                self._sdk_session_id = message.session_id

            if self._sdk_session_id:
                msg_data["sdk_session_id"] = self._sdk_session_id

            yield _make_event(self._session_id, event_type, msg_data)

        print("[agent] turn complete", flush=True)
        yield _make_event(
            self._session_id,
            "turn_complete",
            {
                "message": "Turn complete",
                **({"sdk_session_id": self._sdk_session_id} if self._sdk_session_id else {}),
            },
        )
