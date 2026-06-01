# YIIYA Production Foundation — install + integration guide

This bundle adds the Week 1 production-ready foundation: security, telemetry,
SEO, 3D provider cascade, slop/a11y guards, agent state machine, episodic
memory, and the GLB optimisation pipeline.

## 1. Install dependencies

```bash
npm install
```

The `package.json` adds:

- **Security**: `@upstash/redis`, `@upstash/ratelimit`, `isomorphic-dompurify`, `zod`
- **Telemetry**: `@sentry/nextjs`, `@opentelemetry/*`
- **3D**: `@gradio/client`, `@gltf-transform/*`, `draco3dgltf`, `meshoptimizer`, `sharp`
- **Typography**: `@fontsource-variable/{fraunces,geist,…}`, `@fontsource/{jetbrains-mono,…}`
- **Dev**: `vitest`, `@vitest/coverage-v8`, `prettier`, `supabase`

## 2. Configure environment variables

Copy `.env.example` to `.env.local` and fill these (links inline):

| Service | Variable | Where to get it |
| --- | --- | --- |
| Site origin | `NEXT_PUBLIC_SITE_URL` | the prod URL |
| Supabase | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | https://supabase.com/dashboard |
| Upstash Redis | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | https://console.upstash.com/redis |
| Sentry | `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` | https://sentry.io/settings/projects/ |
| Langfuse (OTEL) | `OTEL_EXPORTER_OTLP_ENDPOINT`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY` | https://cloud.langfuse.com |
| Gemini | `GEMINI_API_KEY` | https://aistudio.google.com/apikey |
| Tripo AI | `TRIPO_API_KEY` | https://platform.tripo3d.ai/ |
| HuggingFace | `HUGGINGFACE_TOKEN` (optional priority) | https://huggingface.co/settings/tokens |
| Plausible | `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` | https://plausible.io/sites |

The TRELLIS.2 / Sparc3D / InstantMesh HuggingFace Spaces are public and require
no key. A `HUGGINGFACE_TOKEN` simply gives priority queueing.

## 3. Run database migrations

```bash
npx supabase db push
# or apply manually in the SQL editor — files live in supabase/migrations/
```

The bundle adds:

- `0003_production_foundation.sql` — `usage_events`, `rate_limits`,
  `episodic_memory`, `user_profile`, `brand_kits`, `moderation_log`,
  `published_views`
- `0004_episodic_match_rpc.sql` — pgvector top-K helper

Both enable Row Level Security; user-scoped reads work via the existing auth
client and the new helpers in `lib/supabase-server.ts`.

## 4. Wire the security guards into `/api/interpret`

`app/api/interpret/route.ts` (1200+ lines) already exists. Add two short edits:

```ts
import { guardRequest, guardOutput } from "./guard";

export async function POST(req: NextRequest) {
  const guard = await guardRequest(req);
  if (!guard.ok) return guard.response;
  const { input, stake, traceId } = guard;
  // … existing architect call using input.transcript …
  const safe = await guardOutput(architectActions, stake, theme);
  if (!safe.ok) return safe.response;
  // return safe.actions to the renderer
}
```

The new `/api/scene/generate/route.ts` is wired end-to-end already and shows
the full pattern (rate limit → firewall → budget → pipeline → stream).

## 5. Kill the persistent blob

Wire `lib/scene/stage-state.ts` into your existing `lib/store.ts`:

```ts
import { initialStage, reduceStage, type StageEvent, type StageState } from "@/lib/scene/stage-state";

interface State {
  stage: StageState;
  dispatchStage(event: StageEvent): void;
}

stage: initialStage,
dispatchStage: (event) =>
  set((s) => ({ stage: reduceStage(s.stage, event, Date.now()) })),
```

Then in `components/scene-canvas.tsx`, replace the always-mounted default
mesh with a switch on `stage.kind`:

```tsx
{stage.kind === "INTENT" && <TypographicPlaceholder text={stage.promptText} />}
{stage.kind === "GENERATING" && <ParticleDissolve progress={stage.progress} text={stage.promptText} />}
{stage.kind === "READY" && <GeneratedMesh url={stage.glbUrl} />}
```

The blob in `lib/scene/object-library.ts` becomes unreachable.

## 6. Generate 3D from the new pipeline

```ts
const res = await fetch("/api/scene/generate", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ kind: "text-to-3d", prompt: "a glass cup", intent: "final" })
});
for await (const event of parseAgentStream(res)) {
  store.dispatchAgentEvent(event);
}
```

`parseAgentStream` lives in `lib/agent/watchdog.ts`. The watchdog should be
started once at app mount and torn down on unmount.

## 7. Telemetry

- **Sentry**: enables automatically when `NEXT_PUBLIC_SENTRY_DSN` is set.
- **OpenTelemetry**: enables automatically when `OTEL_EXPORTER_OTLP_ENDPOINT` is set.
- **Langfuse**: point OTEL at `https://cloud.langfuse.com/api/public/otel`
  and set `LANGFUSE_PUBLIC_KEY` + `LANGFUSE_SECRET_KEY`. Langfuse auto-decodes
  GenAI semconv attributes into per-step traces.

## 8. SEO

- `app/sitemap.ts` and `app/robots.ts` are now Next.js metadata routes.
  Visit `/sitemap.xml` and `/robots.txt` to verify.
- `app/p/[slug]/page.tsx` now exports `generateMetadata` and emits JSON-LD.
- `app/p/[slug]/opengraph-image.tsx` generates a 1200×630 PNG per project.

## 9. Tests

```bash
npm run test
```

Vitest covers the guards (`slop-guard`, `a11y-guard`), the brief extractor,
and the agent state machine. Add more under `lib/**/*.test.ts` and
`services/**/*.test.ts` as you build.

## 10. CI

`.github/workflows/ci.yml` runs typecheck + lint + test + build on every PR.

## 11. Admin observability

`GET /api/admin/usage` with `Authorization: Bearer ${YIIYA_ADMIN_TOKEN}`
returns today's spend, top users, per-provider p95 latency, and recent
errors. Wire a tiny page at `/admin/usage` that calls this and renders
a table.

## 12. Cost guardrails

`lib/billing/usage-meter.ts`:

- Every metered call writes a row to `public.usage_events`.
- Pre-flight `checkBudget(userId)` enforces `USAGE_DAILY_BUDGET_USD_PER_USER`
  and `USAGE_DAILY_BUDGET_USD_GLOBAL`. Defaults: $1/user/day, $5 global/day.
- The Architect refuses to call paid models when the budget is exhausted.

## What's NOT in this bundle (next sprints)

- AR Quick Look (.usdz) export — half-day add on top of `glb-optimizer.ts`
- Brand Kit UI (the schema is here, the editor isn't)
- Custom domain attach via Vercel API
- Plausible analytics injection on `/p/[slug]`
- tldraw vibe board (cursor-as-director surface)
- Mobile-GS WASM bridge for on-device scan
- Onboarding gallery + first-run experience
- Internationalisation
- Stage-state typographic placeholder + particle-dissolve renderer (component
  written into the spec in §5; the visual components are an afternoon of R3F)

Every one of those slots into the foundation cleanly. The schema, guards,
provider cascade, telemetry, and metering this PR ships are the bedrock —
the rest is application code on top.
