from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sse_starlette.sse import EventSourceResponse

from api.protocol import EventQuery, EventSource, SessionEvent


def create_router(get_event_source: callable) -> APIRouter:
    """Create an API router with the given event source dependency."""
    router = APIRouter(prefix="/sessions", tags=["sessions"])

    @router.get("/{session_id}/events")
    async def get_session_events(
        session_id: str,
        event_source: Annotated[EventSource, Depends(get_event_source)],
        event_types: Annotated[list[str] | None, Query()] = None,
        after_sequence: Annotated[int | None, Query()] = None,
        limit: Annotated[int | None, Query()] = None,
    ) -> list[SessionEvent]:
        """Fetch events for a session."""
        query = EventQuery(
            session_id=session_id,
            event_types=event_types,
            after_sequence=after_sequence,
            limit=limit,
        )
        return await event_source.fetch_events(query)

    @router.get("/{session_id}/events/{event_id}")
    async def get_event(
        session_id: str,
        event_id: str,
        event_source: Annotated[EventSource, Depends(get_event_source)],
    ) -> SessionEvent:
        """Fetch a single event by ID."""
        event = await event_source.fetch_event(event_id)
        if event is None or event.session_id != session_id:
            raise HTTPException(status_code=404, detail="Event not found")
        return event

    @router.get("/{session_id}/events/stream")
    async def stream_session_events(
        session_id: str,
        event_source: Annotated[EventSource, Depends(get_event_source)],
        event_types: Annotated[list[str] | None, Query()] = None,
        after_sequence: Annotated[int | None, Query()] = None,
    ) -> EventSourceResponse:
        """Stream events for a session via SSE."""
        query = EventQuery(
            session_id=session_id,
            event_types=event_types,
            after_sequence=after_sequence,
        )

        async def event_generator():
            async for event in event_source.stream_events(query):
                yield {
                    "event": event.event_type,
                    "id": event.id,
                    "data": {
                        "id": event.id,
                        "session_id": event.session_id,
                        "event_type": event.event_type,
                        "payload": event.payload,
                        "timestamp": event.timestamp.isoformat(),
                        "sequence": event.sequence,
                        "metadata": event.metadata,
                    },
                }

        return EventSourceResponse(event_generator())

    return router
