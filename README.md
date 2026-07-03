# Memecoin Analysis Engine

An algorithm-first, explainable due-diligence engine for memecoins. Give it a
Solana token address; it returns a structured, auditable report on the
token's security, market structure, holder distribution, manipulation risk,
momentum, and viral/meme potential - plus a probabilistic, multi-horizon
read on how those signals might evolve.

This is **not** a price predictor and does not use any LLM or ML model in
V1. Every score is the output of explicit, inspectable rules running against
real on-chain and market data. See `docs/ARCHITECTURE.md` for the full
design rationale and scoring methodology.

## Quickstart

Requires Node 20+ and pnpm.

```bash
pnpm install

# One-time: create your own D1 database and wire its id into apps/web/wrangler.toml
cd apps/web
npx wrangler d1 create memecoin-analysis-engine
# paste the returned database_id into apps/web/wrangler.toml

# Apply the schema locally
pnpm db:migrate:local

cd ../..
pnpm --filter @mae/web run build   # build the dashboard once so Pages Functions have assets to serve
pnpm dev:pages                      # runs the API (Pages Functions) + dashboard on http://localhost:8788
```

For frontend-only iteration with hot reload (proxies `/api` to the Pages dev server):

```bash
pnpm dev:pages   # terminal 1 - Pages Functions + assets on :8788
pnpm dev:web     # terminal 2 - Vite dev server on :5173
```

### Deploying to Cloudflare

This project deploys as a **Cloudflare Pages** project connected to this Git
repository - Cloudflare builds and deploys on every push, no local `wrangler
deploy` needed. See `docs/ARCHITECTURE.md` for why Pages (not a Git-connected
Worker) is the deployment target, and the exact dashboard configuration
(root directory, build command, D1 binding).

To apply the schema to the remote database once (or after a migration change):

```bash
cd apps/web && npx wrangler d1 migrations apply memecoin-analysis-engine --remote
```

## Project structure

```
packages/
  core/        deterministic domain logic: engines, scoring, prediction, report builder
                (zero I/O, zero knowledge of any external API - pure & unit-testable)
  providers/   data connectors (DexScreener, RugCheck) that normalize third-party
                payloads into core's input types. The only place that names an API.
apps/
  web/         React + Vite dashboard, deployed as a Cloudflare Pages project
    functions/ Pages Functions (Hono + D1): the HTTP API, under functions/api/[[route]].ts
                everything outside functions/ is served as a static asset by Pages directly
```

## API

- `POST /api/analyze` `{ "address": "<solana mint>" }` -> runs a fresh analysis, persists it, returns `{ id, report }`
- `GET /api/analyses/:id` -> a previously generated report
- `GET /api/tokens/:address/history` -> past analyses for a token (id, verdict, score, timestamp)
- `GET /api/health`

## Data sources (V1)

- **DexScreener** (`api.dexscreener.com`) - pairs, liquidity, volume, FDV/market cap, buy/sell counts, price change
- **RugCheck** (`api.rugcheck.xyz`) - mint/freeze authority, LP lock status, holder concentration, insider wallet clusters, contract risk flags

Both are free, keyless, public APIs. See `docs/ARCHITECTURE.md` for how to add or swap sources.

## Disclaimer

This tool structures and surfaces signals to support a decision - it does not
make one for you. Memecoin markets are adversarial and noisy; absence of red
flags is not a safety guarantee.
