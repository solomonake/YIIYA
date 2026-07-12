# Current agent checkpoint

Generated: 2026-07-12 (claude-fable-5 session — Phase 11 implemented, PR open)

## State
Phases 0–10a are merged to `main` (see git history: PRs #1–#12). This session
adds **Phase 11 — Meshy retexture fast path** on branch
`claude/magical-sanderson-e9518d`:

- `lib/meshy-retexture.ts` (new): Meshy text-to-texture client. API contract
  verified against docs.meshy.ai on 2026-07-12 — `POST/GET
  https://api.meshy.ai/openapi/v1/retexture`, Bearer auth, `model_url`
  (public URL, .glb/.gltf/.obj/.fbx/.stl), `text_style_prompt` (≤600 chars),
  status PENDING/IN_PROGRESS/SUCCEEDED/FAILED/CANCELED, `consumed_credits`
  in the poll response (logged verbatim — never guessed).
- `lib/interpret-pipeline.ts`: `activeAssetGlbUrl` on InterpretRequestBody;
  `sourceGlbUrl` on GeneratedAsset; `runRetexturePath` runs when Director
  says `material_edit` AND the client sent a public GLB URL — same geometry,
  new textures, cascade + Pollinations grounding skipped. Falls back to the
  cascade only when no Meshy task was created (0 credits, clock intact);
  after a created-but-failed task it stops honestly instead of double-spending.
- `lib/use-speech-interpreter.ts`: sends the active asset's Blob URL (https
  only, never the relative proxy URL).
- `app/api/interpret/stream/route.ts` + `lib/assets/persist.ts`: retextured
  assets are cached under a mesh-scoped prompt key
  (`retextureCacheKey(prompt, glbUrl)`) so "make it look more human" never
  serves a cached retexture of a *different* mesh; `findCachedAsset` now
  takes candidate-key arrays.

## Verification (this session)
- `tsc --noEmit` clean; full vitest suite green including 13 new tests in
  `lib/meshy-retexture.test.ts` (URL guard/SSRF, payload shape + 600-char cap,
  texture-map mapping, cache-key scoping, mocked create→poll happy/FAILED/402
  paths). `lib/scene/mesh-export.test.ts` timed out once under parallel load;
  passes in isolation (4/4, 307ms) — flake, not a regression.
- NOT verified live: an actual Meshy retexture call (needs MESHY_API_KEY —
  worktree `.env.local` has empty keys — and spends real credits). The key
  was purchased 2026-07-08 and has never been used; first production run
  should watch the `[RETEXTURE]` logs and the reported credit cost.

## Operating notes carried forward
1. Local `next lint` / `next build` can hang in a sandboxed shell; use
   `npm run typecheck` and `vitest run` via `scripts/agent-check.sh` as local
   gates, GH Actions authoritative for lint/build.
2. GH Actions occasionally creates zero runs for a branch push; retrigger
   once with an empty commit, don't loop.
3. Worktrees have no own `node_modules`; binaries resolve by walking up to
   the main checkout. `node_modules/.bin/…` relative paths fail — go through
   `npm run` / agent-check.

## Next exact actions for a human
1. Review + merge the Phase 11 PR, then say a material edit ("make it look
   more human") over a generated asset in production and confirm the
   `[RETEXTURE]` log line reports geometry preserved + real credit cost.
2. Still open: Phase 10b (generation queue — kills the 300s ceiling, needs a
   Supabase migration) and region-select tuning (needs a problem mesh).

## Boundaries
- Commit/push/PR for Phase 11 were explicitly requested by the user
  (2026-07-12). Merge and production verification remain human actions.
