# Current agent checkpoint

Generated: 2026-07-05

## State
- Branch: main tracking origin/main.
- Worktree: pre-existing user changes are present and should be treated as
  user-owned unless explicitly scoped. Known dirty files include
  `.claude/launch.json`, `.env.example`, `app/api/interpret/stream/route.ts`,
  `components/yiiya-workspace.tsx`, `lib/interpret-pipeline.ts`, and
  `lib/use-speech-interpreter.ts`.
- No local dev server is currently running on port 3000.

## Goal
Set up YIIYA for agent-operated improvement, keep product truth focused on
intent-to-3D/CAD assets, and make the first object-prompt improvement verifiable.

## Completed
- Installed the client-safe Agent OS capsule and `AGENTS.md`.
- Added `scripts/agent-check.sh` to enforce Node 20/22, emit heartbeats during
  quiet checks, and fail with a timeout instead of ambiguous silence.
- Added prompt-intent routing so ordinary noun prompts such as `A car` are
  treated as object requests, while explicit word/text requests remain
  typography requests.
- Updated the live 3D director prompt, text-to-3D service prompt, local fallback
  compiler, and visible stage placeholder to honor object-vs-typography intent.
- Connected car/vehicle prompts to the existing local `library://car` fallback.
- Added regression tests for `A car` versus explicit `word "A car"` behavior.
- Repaired local Node dependency shims with `npm install --prefer-offline
  --no-audit --no-fund` and `npm rebuild`.
- Disabled the local instrumentation hook by default in development while
  preserving production and explicit opt-in behavior via
  `YIIYA_ENABLE_INSTRUMENTATION=1`.
- Started the local Next dev server successfully on `127.0.0.1:3000`.
- Added production readiness requirements in
  `config/production-readiness.json`.
- Added `lib/production-readiness.ts` so runtime status and scripts share the
  same production config contract.
- Added `npm run check:production` as a pre-deploy readiness gate.
- Updated `/api/status` to return `503` in production when core production
  configuration is missing, instead of allowing a broken production deployment
  to look healthy.
- Documented the production readiness gate in
  `docs/PRODUCTION_FOUNDATION.md`.

## Current setup gaps
- `.env.local` exists, but live provider credentials are missing or placeholders.
- `/api/status` correctly reports `ok:false`, `coreOk:false`, and `labOk:false`
  until Supabase, AI provider, scan, storage, and CAD worker settings are
  provided.
- Missing core keys reported by the app: `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
  `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, and `OPENAI_API_KEY`.
- Missing lab keys reported by the app: `FAL_KEY`, `UNSPLASH_ACCESS_KEY`,
  `BLOB_READ_WRITE_TOKEN`, scan reconstruction settings, scan webhook secrets,
  `CAD_WORKER_ENDPOINT`, and `CAD_WORKER_API_KEY`.

## Next exact action
Add real production secrets in the deployment environment, then run
`npm run check:production`. After the core gate passes, deploy only with human
approval and verify production `/api/status` reports `productionReady:true`.

## Blockers
- No production credentials or deploy authority granted.
- Vitest still hangs locally after printing the run banner, so test execution is
  not yet a pass despite dependency repair.
- `npm run typecheck` timed out after 240 seconds with no TypeScript errors
  emitted, so typecheck is inconclusive rather than green.
- Current local `.env.local` / shell environment does not satisfy production
  readiness; the new gate correctly fails until real production values are
  supplied.

## Authority
Human approval required for merge, deploy, credentials, spending, destructive
actions, production mutation, and external communication.

## Verification proof
- `bash scripts/agent-check.sh node -v`: exited 0 and printed `v20.20.2`.
- `bash scripts/agent-check.sh npm -v`: exited 0 and printed `10.8.2`.
- `npm rebuild`: exited 0 after network-enabled rebuild and restored package
  shims.
- `npx vitest --version`: exited 0 and printed `vitest/2.1.9 darwin-arm64
  node-v20.20.2`.
- `node node_modules/typescript/lib/tsc.js --version`: exited 0 and printed
  `Version 5.9.3`.
- `node_modules/.bin/esbuild --version`: exited 0 and printed `0.21.5`.
- Bundled and directly asserted `classifyPromptSubject("A car")` returns an
  object intent and `classifyPromptSubject('Make me a 3D image of the word "A
  car"')` returns a typography intent.
- Bundled and directly asserted `compileLocalIntent({ transcript: "A car" })`
  returns `ADD_3D_OBJECT` with `modelUrl:"library://car"`.
- `curl -sS -I http://127.0.0.1:3000`: exited 0 and returned `307 Temporary
  Redirect` to `/app`.
- `curl -sS -D - http://127.0.0.1:3000/api/status`: exited 0 and returned
  `200 OK` with fail-closed missing configuration details.
- `bash scripts/agent-check.sh npm run check:production`: exited 1 and listed
  missing core and lab production configuration, which is expected for the
  current unconfigured environment.
- `env <fake non-secret core values> bash scripts/agent-check.sh npm run
  check:production`: exited 0 with `Production core: ok`, proving the gate
  passes when core production config is present.
- `./node_modules/.bin/esbuild lib/production-readiness.ts --bundle ...`:
  exited 0.
- `./node_modules/.bin/esbuild app/api/status/route.ts --bundle ...`:
  exited 0.
