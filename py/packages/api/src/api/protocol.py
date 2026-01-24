from abc import abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, AsyncIterator, Protocol


@dataclass(frozen=True)
class SessionEvent:
    id: str
    session_id: str
    event_type: str
    payload: dict[str, Any]
    timestamp: datetime
    sequence: int
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class EventQuery:
    session_id: str
    event_types: list[str] | None = None
    after_sequence: int | None = None
    limit: int | None = None


class EventSource(Protocol):
    @abstractmethod
    async def fetch_events(self, query: EventQuery) -> list[SessionEvent]:
        """Fetch events matching the query."""
        ...

    @abstractmethod
    async def fetch_event(self, event_id: str) -> SessionEvent | None:
        """Fetch a single event by ID."""
        ...

    @abstractmethod
    def stream_events(self, query: EventQuery) -> AsyncIterator[SessionEvent]:
        """Stream events matching the query. Returns an async iterator for SSE."""
        ...
