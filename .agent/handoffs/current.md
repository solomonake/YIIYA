# Current agent checkpoint

Generated: 2026-07-20 (claude session — round 5: handoff-truth + capture fix, pushed to `main`)

## State

**Round 5 is pushed to `main`** (5 commits, `2d0b7b9..8af71fb` → Vercel prod
deploy). Driven by founder live screenshots (white-silhouette captures) and
the round-3/4 checkpoint. Strategy source is still
`docs/PRODUCT_STRATEGY_2026-07.md`.

| Commit | Shipped | Root cause found |
|--------|---------|------------------|
| `2d0b7b9` | Real GLB inspection (`lib/scene/glb-inspect.ts`) + destination-aware readiness (`lib/scene/readiness.ts`) | `validateGlbUrl` skipped non-indexed primitives (degenerate check never ran) and silently PASSED any GLB whose JSON chunk overflowed its fixed 32KB range |
| `77c538a` | Removed all 35 `@ts-nocheck`; deleted `project-persistence.ts` + `timeline-snapshots.ts` (0 importers, broken since pivot); CI guard `scripts/check-no-ts-nocheck.mjs` wired into `npm run typecheck` | 33/35 pragmas suppressed nothing; the 2 real ones hid dead pre-pivot code. NOTE: `supabase-projects.ts`, `lib/brief/*`, `lib/cursor/*`, `lib/critic/*`, `lib/agent/*`, `lib/memory/*` are listed as dead-code candidates in older docs but ARE imported — do not delete on the strength of that list |
| `3d74d6d` | Honest readiness in the tray ("62% preview") replacing the fabricated "watertight" label; readiness threaded through `runPackager` | `isWatertight: tier !== "fallback"` asserted watertightness from which provider answered; stream route hardcoded `true` |
| `f063f8c` | **Capture polarity fix** — tapped object kept in full colour (`lib/vision/mask-region.ts`) | `segment.ts` assumed MediaPipe category mask `>0` = object; production polarity is REVERSED, so the object was painted white and the background kept → white-silhouette cutouts → white 3D blobs, and orbit tracked the background centroid. Polarity now decided per tap (5x5 vote at the tap point, smaller-class tiebreak) so a future MediaPipe/delegate flip cannot re-break it |
| `8af71fb` | **Multi-object capture** — tap up to 4 objects, removable chips, "N objects → N generations" pricing, sequential queue in the workspace that stops on first failure | single `referenceImage` slot forced one object per capture |

**Proof:** `tsc --noEmit` clean (whole repo — zero `@ts-nocheck` remain, guard
enforces it); 127/127 vitest; `/capture` + `/app` compile, render, zero console
errors in dev browser. `/capture` requests camera and degrades correctly when
denied.

## NOT verified (needs the founder — phone + provider credits)

This is the top of the next session's list, in order:

1. **Live capture test on the deployed app** (the whole round hinges on this):
   phone → `/capture` → tap ONE object → the preview chip must show the object
   **in its real colours on white** (not a white silhouette). Then Generate:
   the mesh should carry colour/likeness. Compare against the founder's
   2026-07-20 screenshots (white bust / white AirPods case).
2. **Multi-object**: tap 2-3 objects → chips accumulate → button reads
   "N objects → 3D (N generations)" → studio generates them sequentially with
   `[CAPTURE]` logs between; a failure stops the queue with a skip log.
3. **Orbit** after the fix: tracking should now hold the OBJECT centroid, so
   walk-arounds should degrade less often to "Only N/3 views tracked".
4. Tray now shows measured readiness ("NN% preview/handoff") instead of
   "watertight" — sanity-check it on a fresh generation.

## Still open from earlier sessions

- Roadmap #8 `.usdz`: blocked on infra, not code. `usdzconvert` cannot run on
  Vercel serverless; the real path is a small converter worker (Modal, next to
  the existing `services/reconstruction_worker` + `services/cad_worker`)
  exposing `POST /usdz-from-glb`, then set `USDZ_CONVERTER_URL` (missing from
  `.env.example` — add it when wiring). Reality Converter remains the manual
  fallback and the in-app copy already says so.
- #9 Shopify AR (founder decision), Phase 10b generation queue (Supabase
  migration), Meshy retexture PR #14 (needs funded `MESHY_API_KEY`).
- Scan platform still unreachable from `/app` — clarify purpose with founder.

## Operating notes that still hold

Machine-load triage before code triage (`uptime` first; serialize tsc/vitest;
never broad-pkill); dev server restart + hard reload before trusting in-page
verification; `tsc --noEmit` + `vitest run` are the real local gates; only
deployed envs can generate (local provider keys empty). Merge to `main`
auto-deploys — re-confirm with the founder before each merge batch.
