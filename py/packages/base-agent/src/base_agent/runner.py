from __future__ import annotations

import asyncio
import traceback

from .base_agent import AgentSession
from .types import AgentEvent, EventSink


class AgentRunner:
    """Manages the prompt queue, drives an agent session, and emits events to a sink.

    Does NOT own the ``AgentSession`` lifecycle — the caller is responsible
    for entering/exiting the session context.

    Uses a producer-consumer pattern: a producer task drains
    ``session.request()`` into an internal queue so that
    ``receive_response()`` is never interrupted.  Cancellation can only
    land on the consumer side (queue.get / sink.emit), never on the
    producer.
    """

    def __init__(self, session: AgentSession, sink: EventSink) -> None:
        self._session = session
        self._sink = sink
        self._prompt_queue: asyncio.Queue[str] = asyncio.Queue()
        self._task: asyncio.Task[None] | None = None

    async def start(self) -> None:
        """Start the background loop that processes prompts."""
        self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        """Cancel the background loop and wait for it to finish."""
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None

    def submit(self, prompt: str) -> None:
        """Enqueue a prompt for the agent to process."""
        self._prompt_queue.put_nowait(prompt)

    async def _produce(
        self,
        prompt: str,
        queue: asyncio.Queue[AgentEvent | None],
    ) -> None:
        """Drain session.request() into the queue.

        Runs as an independent task so receive_response() is never
        interrupted by consumer-side cancellation.
        """
        try:
            async for event in self._session.request(prompt):
                await queue.put(event)
        except Exception:
            print(f"[runner] producer error:\n{traceback.format_exc()}", flush=True)
        finally:
            await queue.put(None)

    async def _run(self) -> None:
        while True:
            # CancelledError can safely land here.
            prompt = await self._prompt_queue.get()

            queue: asyncio.Queue[AgentEvent | None] = asyncio.Queue()
            producer = asyncio.create_task(self._produce(prompt, queue))

            try:
                while True:
                    event = await queue.get()
                    if event is None:
                        break
                    await self._sink.emit(event)
                    print(f"[runner] event: {event.type} ({event.id})", flush=True)
            except asyncio.CancelledError:
                # Consumer interrupted — wait for producer to finish
                # so receive_response() completes cleanly.
                print("[runner] cancelled, waiting for producer to finish", flush=True)
                await producer
                raise

            await producer
