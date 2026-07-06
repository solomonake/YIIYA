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

## 2026-07-05: Make production readiness fail closed

- Decision: Centralize production environment requirements in
  `config/production-readiness.json`, expose them through `/api/status`, and add
  `npm run check:production` as a pre-deploy gate.
- Evidence: `/api/status` previously returned `200 OK` even when required
  provider credentials were missing, which could make a broken production
  deployment look healthy.
- Value: risk_reduced, engineering_leverage.
