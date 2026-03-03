import { Hono } from "hono";
import { getProjectContext, setProjectContext } from "../project-context.js";

const app = new Hono();

app.get("/", (c) => {
  return c.json({ content: getProjectContext() });
});

app.put("/", async (c) => {
  const { content } = await c.req.json<{ content: string }>();
  setProjectContext(content);
  return c.json({ ok: true });
});

export default app;
