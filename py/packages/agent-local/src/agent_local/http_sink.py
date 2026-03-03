from __future__ import annotations

import json

import httpx

from base_agent import AgentEvent, EventSink


class HttpEventSink(EventSink):
    """Posts agent events to the API server over HTTP."""

    def __init__(
        self,
        server_url: str,
        session_id: str,
        auth_token: str | None = None,
    ) -> None:
        self._server_url = server_url
        self._session_id = session_id
        self._auth_token = auth_token
        self._client: httpx.AsyncClient | None = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient()
        return self._client

    async def emit(self, event: AgentEvent) -> None:
        url = f"{self._server_url}/sessions/{self._session_id}/events"
        headers: dict[str, str] = {"Content-Type": "application/json"}
        if self._auth_token:
            headers["Authorization"] = f"Bearer {self._auth_token}"

        payload = {
            "id": event.id,
            "sessionId": event.session_id,
            "timestamp": event.timestamp,
            "type": event.type,
            "data": event.data,
        }

        client = await self._get_client()
        resp = await client.post(url, content=json.dumps(payload), headers=headers)
        if resp.status_code >= 400:
            raise RuntimeError(f"Failed to emit event ({resp.status_code}): {resp.text}")

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()
