import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./env.js";
import { analyzeRoute } from "./routes/analyze.js";
import { analysesRoute, tokensRoute } from "./routes/analyses.js";

/**
 * Shared Hono app mounted by the Pages Function catch-all in
 * `functions/api/[[route]].ts`. Kept in `_shared/` (a leading underscore
 * folder) so Cloudflare Pages' file-based function router ignores it - it's
 * imported code, not a routed endpoint.
 */
export const app = new Hono<{ Bindings: Env }>();

app.use("/api/*", cors());

app.get("/api/health", (c) => c.json({ status: "ok", time: new Date().toISOString() }));
app.route("/api/analyze", analyzeRoute);
app.route("/api/analyses", analysesRoute);
app.route("/api/tokens", tokensRoute);

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "Internal server error." }, 500);
});

app.notFound((c) => c.json({ error: "Not found." }, 404));
