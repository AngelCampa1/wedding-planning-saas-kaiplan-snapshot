import { Hono } from "hono";

const app = new Hono();

app.get("/", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

export { app as healthRoutes };
