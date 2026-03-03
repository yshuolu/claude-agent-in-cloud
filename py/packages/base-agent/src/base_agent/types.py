from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol


@dataclass
class AgentEvent:
    id: str
    session_id: str
    timestamp: str
    type: str
    data: dict[str, Any] = field(default_factory=dict)


class EventSink(Protocol):
    async def emit(self, event: AgentEvent) -> None: ...
