# Current agent checkpoint

Generated: 2026-07-08 (claude-opus-4.8 session — all 6 phases complete)

## State
All phases 0-5 from `docs/TRANSFORMATION_PLAN.md` are **merged to `main`**:
- Phase 0 (#1) — GLB-403 fix, real exports, honest logs, TRELLIS.2
- Phase 1 (#2) — Supabase auth, `/library`, poster capture
- Phase 2 (#3) — Director suggestions, intent preview, starter prompts
- Phase 3 (#4) — `/capture` mobile on-device segmentation
- Phase 4 (#5) — turntable video export (UniRig rigging researched, deferred)
- Phase 5 (#6, #7) — persistence, mobile layout, undo/redo, settings + BYO
  HF token, verified-safe dead-code removal (~2,580 lines)

All 10 CI checks (install/typecheck/lint/test/validate/build/GitGuardian/
Vercel/Vercel Preview Comments/Scan Platform) pass on the final merged state.

## This session's operating notes (read before continuing)
1. **Local `next lint` / `next build`'s internal lint step can hang** in a
   sandboxed shell. Use `node node_modules/typescript/lib/tsc.js --noEmit`
   and `node_modules/.bin/vitest run` as the real local gates; let GH Actions
   be authoritative for lint/build.
2. **GitHub Actions CI had a recurring gap** (5 occurrences this session)
   where it silently created zero runs for a branch push, confirmed via the
   Actions API each time, always self-resolving on a later push. When it
   happens: retrigger once (empty commit), don't loop waiting, merge on
   Vercel+GitGuardian+local-verification evidence, document on the PR.
3. **Hydration warnings need a screenshot + localStorage check, not just
   console reading**, before treating them as real. Investigated three
   variants this session; all three were false positives (confirmed via
   clean-cache restart, screenshot showing correct rendering, and — for the
   persist-related one — direct `localStorage.getItem()` returning `null`).
   Still added `skipHydration` + explicit `rehydrate()` to `lib/store.ts` as
   a legitimate defensive practice regardless.
4. Worktree `.env.local` has empty provider keys; production has real keys.
   HuggingFace's shared free ZeroGPU quota was exhausted by this session's
   own testing — expect HF-space generation failures until it resets
   (~24h), or use the new BYO-token Settings field.

## Next exact action for a human
1. **Manually verify `/capture` (camera + on-device segmentation) and the
   turntable recorder on real hardware** — both are type/API-verified this
   session but never visually confirmed (no camera, no working ZeroGPU
   quota available).
2. Decide whether the remaining dead-code cluster is worth a dedicated
   follow-up: `lib/agent/*`, `lib/brief/*`, `lib/critic/*`, `lib/cursor/*`,
   `lib/memory/*`, `lib/security/*`, `lib/seo/*`, `lib/telemetry/*`,
   `lib/billing/*`, `project-persistence.ts`, `supabase-projects.ts`,
   `timeline-snapshots.ts`, `router.ts`, `project-slug.ts` — each needs its
   own import trace before it's safe to delete.
3. Consider whether the scan platform (kept this session — has its own CI
   smoke test) is still wanted; it's currently unreachable from the live
   `/app` UI (no nav link), so its purpose should be clarified with the
   product owner rather than assumed.

## Boundaries
- Human approval was granted in-chat for commit/push/merge/loop-without-
  asking, scoped to this specific 6-phase execution. No destructive git
  operations were used beyond `--force-with-lease` on this session's own
  already-open PR branch after routine rebases.
- Deploys happen automatically via Vercel's GitHub integration on merge to
  `main` — confirmed READY for every phase's production deployment.
