from __future__ import annotations

import os
import sys
import uuid

from base_agent import AgentSessionConfig, run_server

from .http_sink import HttpEventSink


def main() -> None:
    session_id = os.environ.get("AGENT_SESSION_ID", str(uuid.uuid4()))
    server_url = os.environ.get("SERVER_URL")
    auth_token = os.environ.get("AGENT_AUTH_TOKEN")
    model = os.environ.get("AGENT_MODEL")
    port = int(os.environ.get("AGENT_PORT", "9100"))

    if not server_url:
        print("[agent] SERVER_URL is required", file=sys.stderr)
        sys.exit(1)

    sink = HttpEventSink(server_url, session_id, auth_token)
    config = AgentSessionConfig(session_id=session_id, model=model)

    run_server(config, sink, host="0.0.0.0", port=port)


if __name__ == "__main__":
    main()
