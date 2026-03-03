// @ts-nocheck — MCP SDK + Zod v3/v4 compat causes deep type instantiation errors
import { Hono } from "hono";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { getProjectContext } from "../project-context.js";

function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "project-context",
    version: "0.1.0",
  });

  server.tool(
    "get_project_context",
    "Get the project business context (business.md). Call this at the start of every task to understand the project.",
    {},
    async () => {
      const content = getProjectContext();
      if (!content) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No project context has been configured yet.",
            },
          ],
        };
      }
      return { content: [{ type: "text" as const, text: content }] };
    },
  );

  return server;
}

const app = new Hono();

app.all("/*", async (c) => {
  const transport = new WebStandardStreamableHTTPServerTransport();
  const server = createMcpServer();
  await server.connect(transport);
  return transport.handleRequest(c.req.raw);
});

export default app;
