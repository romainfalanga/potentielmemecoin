import { handle } from "hono/cloudflare-pages";
import { app } from "../_shared/app.js";

// File-based routing: this catch-all handles every request under /api/*.
// Everything else falls through to Pages' native static asset serving
// (the built dashboard) without ever invoking a Function.
export const onRequest = handle(app);
