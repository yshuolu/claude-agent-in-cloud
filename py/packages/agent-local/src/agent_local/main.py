from __future__ import annotations

import os
import sys
import uuid

import uvicorn

from base_agent import AgentEvent, AgentWebServerConfig, create_app
from .http_sink import HttpEventSink

AGENT_PORT = int(os.environ.get("AGENT_PORT", "9100"))


def main() -> None:
    model = os.environ.get("AGENT_MODEL")
    session_id = os.environ.get("AGENT_SESSION_ID", str(uuid.uuid4()))
    server_url = os.environ.get("SERVER_URL")
    auth_token = os.environ.get("AGENT_AUTH_TOKEN")

    if not server_url:
        print("[agent] SERVER_URL is required", file=sys.stderr)
        sys.exit(1)

    sink = HttpEventSink(server_url, session_id, auth_token)

    config = AgentWebServerConfig(
        session_id=session_id,
        sink=sink,
        model=model,
    )

    app = create_app(config)

    print(f"[agent] starting on port {AGENT_PORT}")
    uvicorn.run(app, host="0.0.0.0", port=AGENT_PORT)


if __name__ == "__main__":
    main()
