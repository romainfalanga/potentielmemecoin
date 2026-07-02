import { Hono } from "hono";
import type { Env } from "../env.js";
import { getAnalysisById, listAnalysesForToken } from "../db/repository.js";

export const analysesRoute = new Hono<{ Bindings: Env }>();

analysesRoute.get("/:id", async (c) => {
  const report = await getAnalysisById(c.env.DB, c.req.param("id"));
  if (!report) return c.json({ error: "Analysis not found." }, 404);
  return c.json({ report });
});

export const tokensRoute = new Hono<{ Bindings: Env }>();

tokensRoute.get("/:address/history", async (c) => {
  const address = c.req.param("address");
  const history = await listAnalysesForToken(c.env.DB, address);
  return c.json({ address, history });
});
