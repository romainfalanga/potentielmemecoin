import { Hono } from "hono";
import { runAnalysis } from "@mae/core";
import { ProviderError, resolveAnalysisRawInput } from "@mae/providers";
import type { Env } from "../env.js";
import { insertAnalysis, upsertToken } from "../db/repository.js";
import { isValidSolanaAddress } from "../lib/validate.js";

export const analyzeRoute = new Hono<{ Bindings: Env }>();

interface AnalyzeRequestBody {
  address?: unknown;
}

analyzeRoute.post("/", async (c) => {
  let body: AnalyzeRequestBody;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Request body must be valid JSON with an `address` field." }, 400);
  }

  const address = typeof body.address === "string" ? body.address.trim() : "";
  if (!isValidSolanaAddress(address)) {
    return c.json({ error: "Invalid Solana token address." }, 400);
  }

  let rawInput;
  try {
    rawInput = await resolveAnalysisRawInput("solana", address);
  } catch (err) {
    if (err instanceof ProviderError) {
      return c.json(
        {
          error:
            "Could not fetch data for this token. It may be invalid, too new to be indexed, or a data source is temporarily unavailable.",
          detail: err.message,
        },
        502,
      );
    }
    throw err;
  }

  const now = new Date();
  const report = runAnalysis(rawInput, now);
  const id = crypto.randomUUID();

  await upsertToken(c.env.DB, report, now.toISOString());
  await insertAnalysis(c.env.DB, id, report);

  return c.json({ id, report }, 201);
});
