# YIIYA Agent Playbook

## Gotchas

- Product framing: Yiiya sells faster movement from rough creative intent to
  usable 3D/CAD geometry, motion previews, and handoff artifacts. Website
  generation is optional and should not dominate product decisions.
- Node version: `package.json` supports Node 20.x or 22.x. Previous local runs
  saw shell-default Node 24 produce misleading dependency/build failures. Use
  `bash scripts/agent-check.sh <command>` or explicitly put a supported Node on
  `PATH`.
- Silent verification: `next build`, `vitest run`, and `tsc --noEmit` can be
  quiet for long stretches. Silence is inconclusive; wait for exit status and
  use the agent wrapper for heartbeat and timeout output. Confirmed
  2026-07-06 with a repaired install: `node_modules/.bin/vitest run` completes
  (54 tests) and `node node_modules/typescript/lib/tsc.js --noEmit` exits 0 in
  ~5 min. Earlier "vitest hangs / typecheck inconclusive" reports were the
  corrupted-shim environment, not the tooling. Run them in the background and
  poll the log for an `EXIT=` sentinel rather than blocking a foreground shell.

- `next lint` AND `next build`'s internal "Linting and checking validity of
  types..." step can hang indefinitely in this sandboxed shell — process stays
  alive, CPU time stops climbing, no output ever follows. Confirmed
  2026-07-06 on two separate runs. Root cause not confirmed (suspected stdin/TTY
  detection in Next's first-run ESLint prompt), but the workaround is solid:
  don't fight it locally. Run `node node_modules/typescript/lib/tsc.js --noEmit`
  for typecheck and `node_modules/.bin/vitest run` for tests as the real local
  gates; let GitHub Actions CI (non-interactive runner) be the authoritative
  gate for `next lint` and `next build`. Watch the CI run after pushing instead
  of blocking on a local build.

- GLB delivery truth: provider GLBs live on ephemeral hosts. HuggingFace Space
  `*.hf.space/gradio_api/file=...` temp URLs return 403 to an anonymous browser
  GET and expire in minutes, so a "READY" log with a raw Space URL is a visible
  failure. Always mirror to Blob, and when that fails serve through
  `/api/3d/proxy` (attaches `HUGGINGFACE_TOKEN`). Never hand the R3F viewer a
  raw provider URL. See `lib/provider-hosts.ts`.

- Honesty of exports: `/api/3d/convert` must produce the real format
  (`lib/scene/mesh-export.ts` for OBJ/STL). Do not rename GLB bytes to `.obj`
  and call it an export — the file will not open and the product promise is
  export-readiness.

- `errMessage()` in `interpret-pipeline.ts`: the gradio client rejects with
  plain objects; `String(err)` renders `[object Object]` in the user log. Use
  the helper for any provider-call catch.
- Local install fragility: a prior build was blocked by a corrupted local Next
  compiled package where `next/dist/compiled/debug` resolved incorrectly. Repair
  dependency corruption before attributing that class of failure to app code.
- Dirty worktree: this repo commonly has active uncommitted product work.
  Preserve user changes and keep agent improvements in separate files when
  possible.

## Value tracking

Tag improvements as money_saved, risk_reduced, revenue_enabled, or
engineering_leverage.

## Verification ladder

1. For docs/agent-ops only: inspect generated files and run no-op shell syntax
   checks where applicable.
2. For TypeScript behavior: `bash scripts/agent-check.sh npm run typecheck`.
3. For pure library logic: `bash scripts/agent-check.sh npm run test`.
4. For route, rendering, or config changes: run typecheck, tests, and
   `bash scripts/agent-check.sh npm run build`.
5. For scan/provider flows: add credential-safe local checks first, then use
   production providers only after explicit human approval and secrets.
