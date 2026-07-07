# Architecture Decision Register

Record accepted tradeoffs here. Keep entries short, dated, and evidence-backed.

## 2026-07-01: Keep agent operations client-safe and repo-local

- Decision: Install only a sanitized `.agent/` operating capsule and `AGENTS.md`
  in this repo. Keep private consulting methods, cross-client notes, and
  private skill files outside the repository.
- Evidence: The repo had no existing `.agent/` or `AGENTS.md`; repeated work
  needs durable handoff, verification, and boundary rules.
- Value: engineering_leverage, risk_reduced.

## 2026-07-01: Use heartbeat-wrapped verification for agent-run checks

- Decision: Add `scripts/agent-check.sh` as the preferred agent wrapper for
  local checks.
- Evidence: Previous YIIYA validation had unsupported Node-version failures and
  long silent build/test/typecheck runs; package engines allow Node 20.x or
  22.x.
- Value: engineering_leverage, risk_reduced.

## 2026-07-06: Phase 0 — stop the lying (reliability + honesty)

- Decision: Before adding any new capability, fix the places where YIIYA
  reports success it cannot back up. (1) Never hand the viewer a raw provider
  GLB URL — mirror to Blob, else serve via the authenticated `/api/3d/proxy`.
  (2) `/api/3d/convert` produces real OBJ/STL, not renamed GLB bytes; formats
  that can't be produced are not advertised. (3) Logs say `[FAILED]` when the
  cascade fails and never claim "texturing" work that didn't happen. (4) The
  pipeline degrades to a local Director brief instead of dying when Gemini is
  down.
- Evidence: Production reproduced a hard viewer failure — `*.hf.space` GLB
  fetch returned 403 while the log said `[READY]`. Export links returned GLB
  bytes with `.obj`/`.stl`/`.usd` names. `/api/3d/convert?from=` fetched
  arbitrary URLs (SSRF). Missing Gemini surfaced `Missing env var` to users.
- Value: risk_reduced, product_quality, revenue_enabled.
- Proof: typecheck 0 errors; 54/54 vitest incl. 8 new export/allowlist tests;
  curl-verified SSRF rejection and honest 501 for USD.
- Full plan of record: `docs/TRANSFORMATION_PLAN.md` (supersedes the sprint
  list in the strategy doc).

## 2026-07-06: Prefer official microsoft/TRELLIS.2 Space for HF image→3D

- Decision: Put `microsoft/TRELLIS.2` first in the HF provider tier (over the
  older `trellis-community/TRELLIS`), keeping the community space as fallback.
- Evidence: TRELLIS.2 (Dec 2025, 4B, MIT, commercial-OK) leads open image→3D
  quality in 2026; its gradio API (`/start_session` → `/preprocess_image` →
  `/image_to_3d` → `/extract_glb`) was verified live at audit time.
- Value: product_quality. Risk: ZeroGPU quota is unreliable for API use, so it
  stays behind the paid-but-free-credit providers and above the other free
  Spaces; the whole tier is best-effort with hard timeouts.

## 2026-07-05: Make production readiness fail closed

- Decision: Centralize production environment requirements in
  `config/production-readiness.json`, expose them through `/api/status`, and add
  `npm run check:production` as a pre-deploy gate.
- Evidence: `/api/status` previously returned `200 OK` even when required
  provider credentials were missing, which could make a broken production
  deployment look healthy.
- Value: risk_reduced, engineering_leverage.
