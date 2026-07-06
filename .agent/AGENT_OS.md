# YIIYA Agent OS

## Lifecycle

ORIENT -> PAIN -> RESEARCH -> PLAN -> RISK -> IMPLEMENT -> TEST -> BREAK -> REVIEW -> VERIFY -> RECORD -> PR

## Context discipline

- Treat chat history as disposable.
- Keep durable state in `.agent/`.
- Verify the cheapest risky claim before editing after a handoff.
- Continue from the handoff's next exact action unless a human boundary is reached.
- Prefer repo-grounded product truth over generic AI-builder advice.
- Never claim a quiet command passed until it exits with status 0.

## Scorecards

Record substantial work in `.agent/metrics/runs.jsonl` with outcome, proof,
interventions, defects, gates, and estimated value.

## Phase gates

- `ORIENT`: read `YIIYA.md`, product strategy, current handoff, package scripts,
  env example, CI, and the touched code path.
- `PAIN`: name the value leak as `money_saved`, `risk_reduced`,
  `revenue_enabled`, or `engineering_leverage`.
- `PLAN`: pick one safe, reversible improvement unless the user requested a
  larger delivery slice.
- `TEST`: run the narrowest relevant check first, then broader gates when the
  change touches shared behavior.
- `RECORD`: update `.agent/handoffs/current.md` and append a run scorecard for
  meaningful work.
