# Architecture

## Design principle

The system is **algorithm-first**: every score, flag, and probability is the
output of an explicit, named, inspectable rule evaluated against extracted
features. No LLM or ML model sits in the scoring path in V1. This is a
product decision, not a technical limitation - it's what makes the output
auditable ("why did this token get a 41?") and what makes the whole system
testable without mocking a model. An LLM-based narrative or semantic
enrichment layer is a natural V2 addition (see "Extensibility" below), but it
augments the deterministic core rather than replacing it.

## Layers

```
providers/   ->   core/engines   ->   core/scoring   ->   core/prediction   ->   core/report   ->   apps/web/functions (API)   ->   apps/web/src (dashboard)
(fetch + normalize)  (rule engines)     (aggregation)      (horizon scenarios)     (report JSON)        (Pages Functions + D1)              (React)
```

Each arrow is a one-way dependency. `packages/core` has **zero** runtime
dependencies and no knowledge of DexScreener, RugCheck, Cloudflare, or React
- it is pure functions over plain data. This is what lets the scoring logic
be unit-tested in isolation and swapped onto a different runtime (a CLI, a
cron job, a different cloud) without touching a single rule.

### 1. `packages/providers` - data providers / connectors

The only layer that names an external API. Each provider module
(`dexscreener.ts`, `rugcheck.ts`) fetches a third-party payload and maps it
onto core's `SecurityRawInput` / `MarketRawInput` types. `resolve.ts` is the
single place that combines them into `AnalysisRawInput` for a given address.

Adding a new data source (e.g. Birdeye, direct Solana RPC holder data, a
different chain) means: write a new provider module that outputs the same
core types, wire it into `resolve.ts`. No engine, scoring, or prediction code
changes.

**Resilience choice:** if a provider fails outright (bad address, source
down), `resolveAnalysisRawInput` rejects and the API returns a clear error.
We deliberately do not silently substitute a degraded/default security
report on fetch failure - a fabricated "everything looks risky because we
have no data" report is worse than an honest "we couldn't analyze this
token right now."

**Data-quality guard:** upstream feeds occasionally return implausible
values (observed: DexScreener reporting a 487,642% 6h price change on an
established, deeply liquid BONK pair - almost certainly a feed artifact, not
a real move). Rather than trust every field blindly, `dexscreener.ts` clamps
price-change percentages to a plausible ceiling, and the momentum engine
independently detects and excludes anomalous readings from trend rules,
surfacing an explicit "implausible data excluded" flag instead of a false
bullish/bearish claim. The lesson: **never let a single unvalidated upstream
field become a confident verdict.**

### 2. `packages/core/engines` - the six analysis engines

Each engine is a list of `RuleDef`s (see `engines/rule-kit.ts`) evaluated
against features extracted from the raw input. A rule is: an id, a
human-readable label/description, a severity, a signed point impact, a
boolean condition, and an evidence extractor. `evaluateRules` runs every
rule; only the ones whose condition is true "fire" and contribute to the
score and to the report's transparency layer. `rulesEvaluatedCount` tracks
how many rules were *considered* (fired or not), so the report can honestly
say "64 rules evaluated, 16 triggered" rather than only showing the ones
that fired.

| Engine | Direction | Starts at | What it checks |
|---|---|---|---|
| `security` | higher = safer | 100, subtract penalties | mint/freeze authority, LP lock %, liquidity floor, rugged flag, transfer fee/tax, external risk flags |
| `distribution` | higher = healthier | 100, subtract penalties | top1/top10 holder concentration, creator balance %, holder count, insider wallet networks |
| `market` | higher = better structure | 100, subtract penalties | liquidity depth, 24h volume, tx count, FDV/mcap gap, pair count/age |
| `manipulation` | higher = **more** risk | 0, add penalties | volume/liquidity ratio, avg trade size vs participant count, insider networks, self-seeding pattern (creator balance + new pair + high turnover), one-sided flow, spike-then-reversal, no-sells (honeypot) signature |
| `momentum` | higher = stronger trend | 50, neutral | multi-timeframe price alignment, buy/sell ratio, volume acceleration, topping/reversal signature, anomalous-data exclusion |
| `virality` | higher = more memeable | 50, neutral | lexical heuristics on name/symbol: length, meme-vocabulary matches, genericness, readability - V1 has no semantic/LLM layer by design |

`manipulation` is the one engine scored as a **risk** (0 = clean, 100 =
heavily manipulated) rather than a **quality** score, matching how the
product spec names it ("manipulation/rug risk score"). The aggregator
inverts it (`100 - score`) wherever it needs a "higher is better" reading;
the dashboard colors it accordingly.

### 3. `packages/core/scoring` - aggregation

`aggregateScores` combines the six engine scores into one global 0-100
"opportunity score" via a fixed weighted sum (`scoring/weights.ts`):
security 25%, manipulation 20%, distribution 15%, market 15%, momentum 15%,
virality 10%. Security and manipulation together are 45% of the composite on
purpose - structural safety gates everything else.

**Hard gates** short-circuit the weighted composite regardless of how well a
token scores elsewhere: an already-rugged flag, no tradable market at all, a
critically low security score, or a manipulation score ≥ 80 all force the
verdict to `avoid_critical_risk` and cap the score at 18. A token cannot be
"interesting" if it is definitionally unsafe.

Verdict bands (no gate triggered): `<25` avoid, `<40` high-risk speculative,
`<55` caution/mixed, `<68` watch/early-stage, `<82` interesting short-term,
`≥82` structurally sound speculative.

Weights and thresholds live in one file specifically so they can be
recalibrated later without touching engine logic (see "Extensibility").

### 4. `packages/core/prediction` - multi-horizon scenarios

`runPredictionEngine` produces, for 1h/6h/12h/24h/7d/30d, four probabilities
(continuation, rejection risk, pump probability, narrative survival) and a
confidence. This is **not** a forecasting model - it is a deterministic
re-weighting of the same six engine scores per horizon:

- Short horizons (1h-12h) weight momentum and manipulation heavily - that's
  what drives price action on the scale of hours.
- Long horizons (7d-30d) weight security, distribution, and virality
  heavily - structural soundness and narrative staying power are what matter
  over weeks.
- Confidence decays with horizon length (fixed multipliers) to reflect that
  a snapshot says less about 30 days out than about the next hour.

See `HORIZON_PROFILES` and `HORIZON_CONFIDENCE_DECAY` in
`prediction/horizon-engine.ts` for the exact weights.

### 5. `packages/core/report` - report builder

`buildReport` assembles the final `AnalysisReport`: verdict + narrative,
all six sub-scores with their triggered rules, bull/bear factor lists
(derived from `positive` vs `warn`/`danger` triggers), a red-flag list
(danger-severity triggers only), the horizon scenarios, and a transparency
block (rules evaluated/triggered, data freshness, data completeness,
disclaimers). `pipeline.ts` (`runAnalysis`) is the single pure-function
entry point tying engines -> scoring -> prediction -> report together.

### 6. `apps/web/functions` - API + persistence (Cloudflare Pages Functions)

A Hono app mounted as a Pages Functions catch-all:
- `functions/api/[[route]].ts` is the only routed file (file-based routing -
  it handles every request under `/api/*`); it just does
  `export const onRequest = handle(app)` using Hono's `hono/cloudflare-pages`
  adapter.
- `functions/_shared/` holds the actual app: routes, the D1 repository layer,
  address validation. The leading underscore tells Cloudflare Pages to treat
  it as importable code, not a route.
- The app validates the address, calls `resolveAnalysisRawInput` then
  `runAnalysis`, and persists the result to D1 (`tokens` + `analyses` tables
  - see `apps/web/migrations/0001_init.sql`).
- Everything outside `functions/` (the built dashboard) is served by Pages'
  native static asset handling - no fallback/proxy code needed, unlike a
  Worker-with-assets setup.

**Why Pages and not a Git-connected Worker:** an earlier version of this
project deployed as a single Cloudflare Worker (Workers Builds, Git-connected,
serving static assets via a `[assets]` binding). That pipeline repeatedly
stalled in Cloudflare's build sandbox on `pnpm install`'s native postinstall
steps for `wrangler`'s own heavy transitive dependencies (`workerd`, the
~100MB local runtime binary; `sharp`, an image library) - because that
pipeline's deploy step is literally invoking `wrangler deploy` inside the CI
build. Cloudflare Pages' deploy model is structurally different: **Cloudflare
builds and uploads Functions and static assets itself**, as a platform
service, after your build command finishes - `wrangler` (or workerd/sharp)
never needs to run inside the CI sandbox at all. `wrangler` is still a
devDependency of `apps/web` for local development (`pages:dev`), but that
never executes in Cloudflare's own build pipeline.

The `analyses` table denormalizes each sub-score into its own column
alongside the full `report_json`. That's specifically so future
history/trend queries and a recalibration pipeline don't need to
deserialize JSON per row - the schema was designed for the "historize,
compare, recalibrate" roadmap from day one, even though V1 doesn't build
that pipeline yet.

**Cloudflare Pages dashboard configuration** (Git-connected project):
- Root directory: `apps/web`
- Build command: `pnpm run build` (runs `vite build`; `packages/core` and
  `packages/providers` are consumed directly from TS source via the
  workspace symlink, no separate build step needed for them)
- Build output directory: `dist`
- Functions: auto-detected from `apps/web/functions`
- D1 binding: add `DB` -> `memecoin-analysis-engine` under
  Settings -> Functions -> D1 database bindings (or via `wrangler.toml` if
  the Pages project supports Wrangler-config-based bindings)

### 7. `apps/web/src` - dashboard

React + Vite, no UI framework dependency. Renders the verdict banner, the
six score cards (each showing its meter, summary, and top triggered rules),
bull/bear factor columns, red flags, the horizon scenario table, a full
transparency panel (including an expandable complete rule trace - every
rule that fired, on every engine, with its exact point impact), and history
of past analyses for the token.

## Extensibility (deliberately not built in V1)

- **LLM/semantic narrative layer**: the `virality` engine's lexical
  heuristics are a first-pass "coinability" matrix. A future version can add
  a semantic scoring pass (embedding similarity to known viral
  narratives, image/logo analysis) as an *additional* signal feeding the
  same engine interface - it does not need to touch scoring/prediction/report.
- **Recalibration**: because every analysis is persisted with its full
  triggered-rule trace and individual sub-scores, a later phase can compare
  predicted scenarios against realized price/liquidity outcomes and adjust
  `DEFAULT_WEIGHTS` or rule point-impacts. Nothing about the current schema
  or pipeline needs to change to enable this - it's a batch job that reads
  `analyses` and proposes new weights.
- **Solana RPC provider**: RugCheck already surfaces mint/freeze authority
  and holder data, so a direct RPC provider isn't in V1. Adding one (e.g. for
  data RugCheck doesn't index yet, or for other chains) is a new file in
  `packages/providers` that returns the same `SecurityRawInput` shape.
- **Additional chains**: `ChainId` is already a discriminated type; adding
  `"ethereum" | "base" | ...` means new provider implementations, not new
  engines.

## Known limitations (V1)

- Single data-source-of-truth per domain (DexScreener for market, RugCheck
  for security/distribution) - no cross-source reconciliation yet.
- No real-time/streaming updates - each analysis is a point-in-time snapshot
  triggered by a user request.
- Virality scoring is lexical/heuristic only, no semantic or visual analysis.
- No authentication/rate-limiting on the API yet - fine for a personal/demo
  deployment, not for a public multi-tenant one.
