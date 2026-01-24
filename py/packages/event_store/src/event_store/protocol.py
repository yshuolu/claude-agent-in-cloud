from abc import abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, AsyncIterator, Protocol


@dataclass(frozen=True)
class Event:
    id: str
    session_id: str
    event_type: str
    payload: dict[str, Any]
    timestamp: datetime
    sequence: int
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class EventFilter:
    session_id: str | None = None
    event_types: list[str] | None = None
    after_sequence: int | None = None
    after_timestamp: datetime | None = None
    limit: int | None = None


class EventStore(Protocol):
    @abstractmethod
    async def append(self, event: Event) -> None:
        """Append an event to the store."""
        ...

    @abstractmethod
    async def get_events(self, filter: EventFilter) -> list[Event]:
        """Retrieve events matching the filter criteria."""
        ...

    @abstractmethod
    async def get_event(self, event_id: str) -> Event | None:
        """Retrieve a single event by ID."""
        ...

    @abstractmethod
    def subscribe(self, filter: EventFilter) -> AsyncIterator[Event]:
        """Subscribe to events matching the filter. Returns an async iterator of new events."""
        ...

    @abstractmethod
    async def get_latest_sequence(self, session_id: str) -> int | None:
        """Get the latest sequence number for a session."""
        ...
