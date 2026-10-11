# YIIYA v2 design package

Date: 2026-10-10
Value: revenue_enabled, risk_reduced, engineering_leverage
Source brief: `docs/CLAUDE_PRODUCT_DESIGN_PROMPT.md`

## Scope

Design-only deliverable in `design/yiiya-v2/`. No production pages, API routes,
credentials, deployments, provider calls or paid generation. Preserve all
uncommitted user work (free-only change set, `.claude/skills/`).

## Plan

1. Audit current screens (local dev server, no generation submitted because
   real HF/Gemini credentials are configured locally) and source paths.
2. Tokens: primitive → semantic → component, light/dark, contrast validated by
   a script (`design/yiiya-v2/scripts/check-contrast.mjs`).
3. One static, dependency-light prototype (vanilla JS + vendored three.js copy)
   with deep-linkable states, so the screen gallery and the clickable prototype
   share one source of truth.
4. Screen/state gallery rendering prototype states in iframes at 1440/768/390,
   three visual directions on the same populated studio, captured PNGs.
5. Docs: README, current-state audit, product spec + capability ledger,
   design system, implementation handoff, QA checklist.
6. Verify in the browser pane at target sizes; record results honestly.

## Acceptance

- Every surface/state in the brief inventory reachable by deep link.
- Prototype labels simulated outcomes; current vs proposed capability is
  switchable and visible.
- Contrast script exits 0 with all required pairs ≥ 4.5:1 (text) / 3:1 (UI).
- Screens actually opened at 1440, 768, 390 and 320 widths.
