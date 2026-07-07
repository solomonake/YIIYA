# Current agent checkpoint

Generated: 2026-07-07 (claude-opus-4.8 session, continued autonomous execution)

## State
- Branch: `claude/reverent-wiles-0b7f37`.
- **Phase 0 MERGED** (#1, commit 7f95ec1 on main) — GLB-403 fix, real exports,
  honest logs. Verified live in production.
- **Phase 1 MERGED** (#2, commit 0a00b74 on main) — Supabase auth + `/library`
  + poster capture. Migration `0005_assets.sql` applied live.
- **Phase 2 MERGED** (#3, commit db7586c on main) — Director suggestion chips,
  intent preview, starter prompts.
- **Phase 3 open** (#4) — mobile capture + on-device MediaPipe segmentation.
  Watching CI, will merge once green.
- Plan of record: `docs/TRANSFORMATION_PLAN.md`.

## This session's operating notes (read before continuing)
1. **Local `next lint` / `next build`'s internal lint step can hang** in this
   sandboxed shell (interactive-prompt-like behavior, CPU flatlines, process
   never exits). Use `node node_modules/typescript/lib/tsc.js --noEmit` for
   typecheck and `node_modules/.bin/vitest run` for tests as the real local
   gates; let GitHub Actions CI be authoritative for lint/build.
2. **GitHub Actions CI had a ~15-20 min gap** where it silently stopped
   creating runs for pushes to this PR branch (confirmed via
   `gh api repos/.../actions/runs` — zero runs, not queued/failed) while
   GitGuardian/Vercel kept working. Self-resolved with no repo-side fix.
   Documented on PR #3's thread and in `.agent/playbook.md`. If it recurs,
   don't block — substitute Vercel's real build + local typecheck/test as
   evidence and say so explicitly.
3. **A Next.js dev-mode hydration warning mid-session was a Fast Refresh
   artifact**, not a real bug — vanished after `rm -rf .next` + full dev
   server restart with identical code. Always rule this out before treating
   a hydration warning as a real defect.
4. Worktree `.env.local` has empty provider keys; production has real keys.
   HuggingFace's shared free ZeroGPU quota was exhausted by this session's
   own testing (resets ~24h after first use) — expect generation failures on
   HF-space providers until it resets; this is not a code regression.

## Next exact action
1. Confirm PR #4 (Phase 3) CI is green, merge it, verify the production
   deploy goes READY.
2. **Ask the user to manually test `/capture` on a real phone or webcam** —
   this session has no camera hardware, so the capture→segment flow is
   type/API-verified only, not visually confirmed live.
3. Continue to Phase 4 (motion + rigging: turntable video export, UniRig
   auto-rigging, animation presets) per `docs/TRANSFORMATION_PLAN.md`, then
   Phase 5 (UX hardening, undo/redo, settings, dead-code removal).

## Verification proof (this session, Phases 0-3)
- 4 PRs merged/open, all with local `tsc --noEmit` 0 errors and full
  `vitest run` green (62/62 tests, 16 files, +8 new test files this session).
- Phase 0 reproduced-then-fixed a real production bug (403 viewer failure)
  and re-verified the fix live.
- Phase 1's migration applied to the live Supabase project with a clean
  security-advisor pass (RLS policy present, no new findings).
- Phase 3's MediaPipe usage checked against the installed package's actual
  `.d.ts` before writing code, not assumed from memory.

## Boundaries
- Human approval was granted in-chat for commit/push/merge/loop-without-
  asking for this specific task. Still no destructive git operations were
  used (no `--force`, only `--force-with-lease` on my own already-open PR
  branch after rebases; no `reset --hard`; nothing on `main` directly).
- Deploys happen automatically via Vercel's GitHub integration on merge to
  `main` — no separate manual deploy step was taken or needed.
