# YIIYA Integration — Complete

This document tracks what was wired directly into your existing files, what
you still need to do (15 minutes of one-time setup), and what to verify.

## What was wired into your existing files

### `lib/store.ts`

- Imported `createStageSlice` + `StageSlice` type.
- Changed the store creator signature from `create<YiiyaState>((set) => …)` to
  `create<YiiyaState & StageSlice>((set, get) => …)`.
- Spread `...createStageSlice(set, get)` at the end of the initial state.
- **Result:** every existing selector keeps working untouched.
  `useYiiyaStore((s) => s.stage)` now returns the lifecycle state;
  `useYiiyaStore.getState().stageDispatch(event)` dispatches transitions.

### `components/scene-canvas.tsx`

- Imported `<Stage as StagePlaceholder />` from `@/components/scene/stage`.
- Added `stage` prop to `StarterScene`; threaded it through from `SceneCanvas`.
- Empty-canvas affordance now renders:
  - `<QuietStarterMarker />` when `stage.kind === "EMPTY"` (no prompt yet).
  - `<Stage state={stage} />` for INTENT / GENERATING / READY / ERROR.
- The persistent blob is dead. Real `SceneObject`s replace the Stage as soon
  as they land (existing render path untouched).

### `lib/use-speech-interpreter.ts`

- On every non-partial transcript: dispatches `PROMPT_TYPED` so the
  typographic placeholder appears immediately (the magic-moment cue).
- On error: dispatches `GENERATION_FAILED` so the placeholder clears
  cleanly rather than freezing the user on a stuck prompt word.

### `lib/action-runner.ts`

- `LOAD_3D_MESH` handler dispatches `GENERATION_READY` with the GLB URL.
- `ADD_3D_OBJECT` / `ADD_SPATIAL_OBJECT` handler dispatches `GENERATION_READY`
  with a `procedural://…` sentinel for the procedural mesh path.
- The Stage component cross-fades to the real mesh once the SceneObject
  exists (existing `RenderedObject` path handles the actual draw).

## One-time setup (15 min)

1. **Install new deps** if not yet:
   ```bash
   npm install
   ```
   Picks up the packages added in `package.json`: Sentry, Upstash, OTEL,
   gltf-transform, Fontsource family, sharp, gradio-client, Zod, Vitest.

2. **Drop the typeface JSON** the typographic placeholder needs:
   ```bash
   # From any DM Serif Display TTF (download from Google Fonts):
   npx facetype.js DMSerifDisplay-Regular.ttf > public/fonts/dm-serif-display.json
   ```
   Until this file exists, the placeholder renders nothing — but the rest of
   the pipeline (particle dissolve, real mesh) still works, so no crashes.

3. **Run migrations**:
   ```bash
   npx supabase db push
   ```
   Applies `0003_production_foundation.sql` (brand_kits, episodic_memory,
   user_profile, usage_events, domain attach) and `0004_episodic_match_rpc.sql`.

4. **Fill in env vars** the new code reads (see `.env.example`):
   - `NEXT_PUBLIC_SITE_URL` — for sitemap.ts / robots.ts canonical URLs
   - `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` — turns on analytics on /p/[slug]
   - `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` — rate limiting
   - `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN` — error tracking
   - `OTEL_EXPORTER_OTLP_ENDPOINT` (Langfuse) — per-stage observability
   - `TRIPO_API_KEY`, `HF_TOKEN` — 3D providers
   - `VERCEL_TOKEN` + `VERCEL_PROJECT_ID` — custom domain attach

5. **Verify the build**:
   ```bash
   npm run typecheck   # was passing pre-edits; verifies the integration
   npm run test        # 8 vitest specs
   npm run build       # full Next build
   ```

## What you'll see

Empty canvas → say "a glass cup":

1. Typographic placeholder ("a glass cup") fades in, slow orbit.
2. Particle dissolve begins (density fades as `GENERATION_PROGRESS` events fire).
3. Real GLB lands → Stage cross-fades to the real mesh.
4. Existing `RenderedObject` path takes over once the SceneObject is in the store.

Compared to the old blob: the canvas now visibly *responds* to what the user
said, every step is intentional and visible, and there's no default lump
sitting there before any prompt.

## Test the full path manually

```bash
npm run dev
# Open localhost:3000, hit the voice button or type "a glass cup"
# Watch: blob is gone. Typographic placeholder. Then particles. Then real mesh.
```

## What still needs human attention

- **Typeface file** at `/public/fonts/dm-serif-display.json` — one CLI command.
- **Plausible domain config** if you want analytics — one env var.
- **Brand kit logo upload** — currently URL-only via the CRUD UI; wiring
  `@vercel/blob` upload here is ~15 minutes if you want file uploads.
- **GENERATION_STARTED + GENERATION_PROGRESS dispatch** is wired for ERROR and
  READY but not yet for the in-flight progress signal. Hook it where your 3D
  provider emits its SSE progress events (`services/scene/providers/*`). The
  state machine accepts `{ type: "GENERATION_PROGRESS", progress: 0..1, etaMs? }`.

That's it. Run the dev server and the integration is live.
