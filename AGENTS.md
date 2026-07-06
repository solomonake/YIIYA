# YIIYA Agent Operating Contract

This repo may be worked on by AI agents. Product truth lives in `YIIYA.md`,
`docs/PRODUCT_STRATEGY_3D_CAD.md`, and the application code. Operating truth
lives in `.agent/`.

## Entry sequence

1. Read `AGENTS.md`, `.agent/AGENT_OS.md`, `.agent/playbook.md`,
   `.agent/decisions.md`, and `.agent/handoffs/current.md`.
2. Inspect current git state before editing.
3. Search before reading large files.
4. Treat existing uncommitted work as user-owned unless the user says otherwise.
5. Fill a plan before substantial edits.
6. Refresh `.agent/handoffs/current.md` after meaningful phases and before context pressure.

## Repo identity

YIIYA is an AI CAD and 3D animation acceleration studio. Its core value is
intent-to-asset compilation for voice, cursor context, reference images, scans,
editable 3D/CAD-ready objects, motion previews, and export handoffs. Do not
reduce the product back into a generic website/template builder.

## Commands

Use Node 20.x or 22.x. Local history shows the default shell may expose an
unsupported Node version, and quiet checks are not proof of success.

Recommended agent wrapper:

```bash
bash scripts/agent-check.sh npm run typecheck
bash scripts/agent-check.sh npm run test
bash scripts/agent-check.sh npm run build
```

Direct commands:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm run smoke:scan
```

## Boundaries

Merge, deploy, credentials, spending, destructive actions, production mutation,
and external communication require explicit human approval.

Fail closed around provider credentials and production status. Missing Gemini,
Supabase, Tripo, HuggingFace, Vercel, Sentry, Upstash, or OTEL configuration is
a setup gap, not a successful live integration.

## Continuity

Before context pressure or long verification, write a handoff with completed
work, proof, blockers, human boundaries, and one next exact action.
