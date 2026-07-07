# YIIYA Transformation Plan — Production-Grade Voice-First 3D Studio

Last updated: 2026-07-06
Status: ACTIVE — this supersedes the sprint list in `PRODUCT_STRATEGY_3D_CAD.md`
(the strategy/thesis in that doc still stands; this is the execution plan).

## What YIIYA is becoming

The fastest way for a non-technical person to go from **spoken intent, a photo,
or a phone camera** to a **validated, textured, rigged, exportable 3D asset** —
built entirely on free/open-source models, honest about quality, usable on a
phone.

Differentiation vs Meshy / Tripo / Rodin / Luma Genie:

1. **Voice-first + intent intelligence** — nobody else leads with speech, and
   YIIYA already distinguishes "a car" (object) from `the word "a car"`
   (typography) via `lib/scene/prompt-intent.ts`.
2. **Honest validation** — competitors hide failures; YIIYA validates GLBs
   (magic bytes, triangle count) and should surface readiness scores as UI.
3. **Free stack** — Gemini free tier + HF ZeroGPU Spaces + Pollinations +
   on-device WebGPU segmentation = $0 marginal cost. Competitors bill per
   generation.
4. **Capture-to-3D on mobile** — tap an object in your camera view, get a 3D
   model. Luma does scans (many frames); YIIYA does single-photo + SAM
   segmentation, which is faster and works on any phone.

## Current-state audit (2026-07-06)

### What works (keep)

- `lib/interpret-pipeline.ts` — the real pipeline. Director (Gemini) →
  Studio-photo grounding (Pollinations) → 8-provider cascade (fal → Tripo →
  Meshy → 4 HF Spaces) → GLB validation (magic/size/triangles) → Blob mirror.
- Prompt intent classification with regression tests (`prompt-intent.test.ts`).
- Provider hard-timeout + deadline discipline (`withTimeout`, 270s budget).
- Fail-closed production readiness gate (`/api/status`, `check:production`).
- The minimal 3-panel workspace shell (log / canvas / asset tray).

### What is broken or dishonest (fix first)

| # | Finding | Evidence | Severity |
|---|---------|----------|----------|
| 1 | **Viewer 403s on provider GLBs.** `mirrorGlbToBlob` silently returns the raw ephemeral gradio URL on failure; browser can't auth to `*.hf.space/gradio_api/file=` | Console: `GET https://tencentarc-instantmesh.hf.space/... 403`; `vercel-blob.ts:23` | CRITICAL — the product's core loop visibly fails while logs say READY |
| 2 | **Exports are fake.** `/api/3d/convert` returns GLB bytes renamed to `.obj`/`.stl`/`.usd` — they won't open | `app/api/3d/convert/route.ts` ("stub" comment) | CRITICAL — "export ready" is the product promise |
| 3 | **"texturing..." log lies.** Pollinations texture images are generated but never applied to the mesh | `generatePBRTextures` → only stored as `textureUrls`, decorative | HIGH |
| 4 | **Raw internal errors shown to users** (`Missing env var: GEMINI_API_KEY`) and pipeline hard-dies without Gemini | Local test 2026-07-06 | HIGH |
| 5 | **SSRF**: `/api/3d/convert?from=` fetches arbitrary URLs | route source | HIGH (security) |
| 6 | **Zero persistence** — refresh loses everything; no users, no history | store is memory-only Zustand | HIGH (product) |
| 7 | **Dead parallel architecture** (~60% of code): `services/scene/*`, `/api/scene/generate`, asset-jobs, scan platform, brand-kits, billing, memory, agent state-machine — not wired to the live path; in-memory `globalThis` job stores break on serverless | file inventory | MEDIUM (confusion, build weight) |
| 8 | **Old TRELLIS space** — pipeline uses `trellis-community/TRELLIS`; the official `microsoft/TRELLIS.2` (Dec 2025, 4B, MIT) is better and free | `interpret-pipeline.ts:413` | MEDIUM |
| 9 | No mobile layout, no undo/redo, no settings, no onboarding/prompt help | UI review | MEDIUM |
| 10 | Log panel resets on remount (sessionStorage boot guard) and generation state is lost if the tab reloads mid-run | local test | LOW |

### Open-source model stack (researched 2026-07)

| Capability | Choice | Why | Fallback |
|---|---|---|---|
| Text→image grounding | Pollinations.ai (free, no key) | already integrated | Gemini image gen (free tier) |
| Image→3D (quality) | **microsoft/TRELLIS.2** HF Space (ZeroGPU, MIT) | best open PBR GLB, commercial OK | Hunyuan3D-2.1 space |
| Image→3D (speed) | Stable Fast 3D (<1s) | already integrated | InstantMesh |
| Prompt/intent LLM | Gemini 2.5 Flash free tier | already integrated | Anthropic/local compiler |
| Segmentation (mobile capture) | **SAM 3 / SlimSAM in-browser via WebGPU (transformers.js)** | zero server cost, private, works offline | `@mediapipe/tasks-vision` interactive segmenter (already a dependency!) |
| Auto-rigging | **UniRig (VAST-AI, SIGGRAPH 2025)** HF Space | open-source, rigs humans/animals/objects | skip rig, turntable only |
| Animation preview | three.js AnimationMixer + retarget presets, client-side | free, instant | — |
| Format conversion | gltf-transform (already a dep) + custom OBJ/STL writers, server-side | real files, no external service | Blender headless on Modal (later) |
| Storage | Vercel Blob + Supabase Postgres | already provisioned | — |
| Auth | Supabase Auth (magic link + Google) | free tier, RLS already used | — |

## Execution phases

Each phase is a shippable PR. Codex: treat each numbered item as a work order;
files are named precisely.

### Phase 0 — Stop the lying (reliability + honesty) ← THIS SESSION

0.1 **GLB delivery guarantee.** New route `app/api/3d/proxy/route.ts`:
    `GET /api/3d/proxy?src=<url>` — allowlist provider hosts (`*.hf.space`,
    fal/tripo/meshy CDNs, Pollinations), attach `Authorization: Bearer
    ${HUGGINGFACE_TOKEN}` for hf.space URLs, stream bytes with
    `Cache-Control: immutable`. In `runSpatialGenerator`: after validation,
    if `mirrorGlbToBlob` fails, rewrite the winning URL through the proxy
    instead of handing the browser a doomed URL. Emit a `[MIRROR]` warning
    log event when running on proxy instead of Blob.
0.2 **Real exports.** Rewrite `/api/3d/convert` to do actual conversion
    server-side: OBJ (positions/normals/uvs writer), binary STL (28-byte
    triangle records), GLB passthrough with Draco/meshopt optimization via
    `@gltf-transform/functions`. Drop USD from the tray until a real
    converter exists (or gate behind `USDZ_CONVERTER_URL`). Add allowlist
    (fix SSRF) + 25MB cap.
0.3 **Honest logs.** Remove the "texturing..." message; say what actually
    happens ("Applying provider textures" only when the GLB has textures —
    detectable in validation). Replace raw env errors with friendly setup
    guidance; keep detail in server logs.
0.4 **Deterministic fallback Director.** When Gemini is unavailable, build the
    brief locally from `classifyPromptSubject` instead of dying.
0.5 **TRELLIS.2 upgrade.** Point `hf-trellis` at `microsoft/TRELLIS.2`,
    verify endpoint names via `Client.view_api()`, keep old space as fallback.

### Phase 1 — Users + Library (Supabase)

1.1 Migration `0005_assets.sql`: `public.assets` (id uuid pk, owner_id uuid
    null → auth.users, prompt text, brief jsonb, glb_url text, poster_url
    text, formats jsonb, validation jsonb, tier text, created_at). RLS:
    owner all, anon insert-with-null-owner (rate-limited server-side).
1.2 Supabase Auth: magic-link + Google. `components/auth/` sign-in sheet.
    Anonymous sessions keep working; on sign-in, claim recent anon assets
    (match by device id cookie).
1.3 Save every successful generation server-side in the stream route (fire
    and forget after `asset_ready`).
1.4 `/library` screen: responsive grid (poster, name, tier, date), open in
    studio, download pack, delete, share toggle → public `/a/[id]` viewer
    page with AR Quick Look (`components/ar-quicklook.tsx` exists).
1.5 Poster capture: `gl.domElement.toDataURL` after first frame of loaded
    GLB → upload to Blob.

### Phase 2 — Prompt intelligence + coaching

2.1 Extend Director JSON with `suggestions: string[]` (3 refinement chips:
    material, style, detail) and `clarifyingQuestion?: string`. Show chips
    under the input after each generation; tapping appends to prompt and
    regenerates.
2.2 Empty-state starter gallery: 6 curated example prompts with poster
    thumbnails (pre-generated, shipped as static assets).
2.3 Intent preview chip while typing (client-side `classifyPromptSubject`):
    "→ object: car" vs "→ 3D text: 'a car'" so users learn the grammar.
2.4 Voice UX: live waveform, interim transcript overlay on canvas,
    auto-submit on silence (already: onend), spoken-command cheatsheet in
    help sheet.

### Phase 3 — Image→3D + mobile capture

3.1 `/capture` route (mobile-first PWA): camera stream → tap/box the object
    → on-device segmentation → masked crop preview → "Generate 3D".
    Segmentation ladder: WebGPU SAM (transformers.js, ~80MB, cached) when
    available; else MediaPipe Interactive Segmenter (~10MB); else send full
    image (server rembg via existing provider preprocessing).
3.2 Wire mask output into existing `referenceImage` flow (base64 → cascade).
3.3 PWA manifest + icons + `viewport` fixes; installable on iOS/Android.
3.4 Desktop upload flow gets the same "click the subject" isolation step.

### Phase 4 — Motion + rigging

4.1 Turntable video export: client-side capture (MediaRecorder on the R3F
    canvas, 360° orbit, 4s webm→mp4) — free, instant, shareable.
4.2 UniRig integration: "Rig it" button on character/creature assets →
    UniRig HF Space via gradio client (same proxy/mirror pattern) → rigged
    GLB stored as new format in the asset pack.
4.3 Animation presets: idle/walk/spin retargeted client-side with three.js;
    export animated GLB.
4.4 Exploded-view toggle for multi-mesh GLBs (offset along normals).

### Phase 5 — UX hardening + performance

5.1 Mobile workspace: bottom-sheet log, floating mic FAB, thumb-reach
    controls, safe-area insets.
5.2 Undo/redo: Zustand temporal middleware over scene + asset selection;
    Cmd/Ctrl+Z, on-screen buttons.
5.3 Settings sheet: provider order override, BYO HF token (stored locally,
    sent as header), quality preset (fast/balanced/best → provider order +
    steps), voice language, clear-data.
5.4 Session persistence: `persist` middleware for assets/logs (localStorage)
    so refresh doesn't wipe the studio; "Resume last session" prompt.
5.5 Perf: mirror step optimizes GLB (Draco + meshopt + 1K texture resize)
    before storing; lazy-load `@react-three/rapier` (heavy WASM) only when
    physics requested; `next/dynamic` the capture route models.
5.6 Delete dead code: `services/scene/*`, `app/api/scene/generate`,
    `lib/asset-jobs.ts` + routes, brand-kits, section-variants, scan
    platform (until reconstruction worker is real), memory/billing stubs.
    Keep `lib/scene/*`, `spatial-export`, `usdz-export` (used or Phase 4).

### Phase 6 — Trust + growth (later)

- Public gallery of shared assets (moderated).
- Blender/Unity import guides per asset ("connectors": download pack
  includes a README with import steps; later a Blender add-on).
- Validation report UI (readiness scores from strategy doc).
- Optional paid tier only when volume demands it.

## Non-negotiables while executing

- Never claim success the artifact can't prove (no fake exports, no
  "READY" when the viewer will 403).
- Every provider call needs a hard timeout and a user-visible failure line.
- Zero paid APIs. Gemini/HF/Pollinations free tiers + user's own keys only.
- Mobile is a first-class target: test at 390×844 before merging UI.
- Keep `npm run check:production` green and honest.
