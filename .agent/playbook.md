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
  use the agent wrapper for heartbeat and timeout output.
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
