# Current agent checkpoint

Generated: 2026-07-18 (claude-opus-4.8 session — rounds 3–4 merged & deployed)

## State

**Rounds 3–4 are MERGED to `main` and pushed** (merge commit `5fe14d8`,
8 commits, `d23a2d5..5fe14d8` → triggers the Vercel prod deploy).
Branch `feat/novel-tool-round-3` is merged; safe to delete.

Driven by founder live feedback (screenshots + console) and
`docs/PRODUCT_STRATEGY_2026-07.md` — **read that first**: it carries the market
thesis, competitor grounding, cost math, and the ranked 22-item roadmap.

| ID | Shipped | Root cause found |
|----|---------|------------------|
| P1 | Stop paid regen on cut-off/ambiguous voice edits (`classifyEditIntent` + `pendingEditConfirm`) | "make it" (voice cut off) returned null from `parseLocalEdit` → fell through to a full **paid** generation → surprise new object |
| P2 | Real tray thumbnails + fixed blank library posters | Canvas `gl` lacked `preserveDrawingBuffer:true` → `toDataURL()` captured a blank frame; capture was also gated on a Supabase `dbId`, so anonymous users got nothing |
| P3 | Public share/AR viewer `app/view/` (`page.tsx` server + `viewer.tsx` client) | No destination existed for a finished asset; `ArQuickLook` was dormant (zero callers) |
| P4 | Square-pad the isolated capture (`lib/vision/segment.ts`) | Tight non-square crop → image-to-3D models misjudge proportions and clip |
| P5 | Daily free-generation quota (`YIIYA_FREE_GENERATIONS_PER_DAY`) | `generate3d` limiter was **dead code** — never called; the only real cap was a hidden $1/day budget |
| R4 | Free-edit chips (#5), `/view` OG unfurl (#7), tray share (#12), quota meter (#19), expired-asset notice (#20) | roadmap items from the report |

**Proof:** `tsc --noEmit` exit 0 (zero error lines); `vitest run` 83/83 pass.
Caveat: a full `vitest run` under machine load times out
`lib/scene/mesh-export.test.ts` (10s limit, ran 15s); it passes **4/4 in 652ms
in isolation**. Load artifact, not a regression.

**Founder has now set** `BLOB_READ_WRITE_TOKEN`, `YIIYA_FREE_GENERATIONS_PER_DAY`,
and Upstash in Vercel — the previous top blockers. Durable library posters, GLB
mirroring, and cross-instance quota enforcement should now be live.

## This session's operating notes (read before continuing)

1. **Check machine load BEFORE blaming code.** ~10 tool calls were burned here
   on "slow/failing" typechecks that were pure environment: load average
   **12–14**, ~4.5M pageouts (swap thrash), `tsc` sitting at **0% CPU / 22MB**
   (starved, not computing — it normally uses 300–600MB). Run `uptime` and
   `ps aux | grep tsc` first. Biggest hogs on this machine: the ChatGPT desktop
   app's node kernels and Spotlight indexing.
2. **Run ONE heavy tool at a time.** `tsc` + `vitest` + `next dev` concurrently
   is what tipped this box into swap. Serialize them.
3. **Never `pkill -f tsc|vitest` broadly.** It kills sibling/in-flight runs and
   produces *fake* "exit 1" failures that read as real errors. Every "exit 1"
   this session was a killed process — the logs were always empty. Kill by PID.
4. **A test timeout ≠ a broken test.** Re-run the single failing file in
   isolation before believing it.
5. **Next.js dev serves stable-named chunks** (`app/<route>/page.js`), so the
   browser reuses a cached OLD chunk after an edit — in-page verification
   silently checks stale code. Restart the dev server *and* hard-reload before
   trusting it. This defeated `/view` E2E verification here.
6. **The app CSP dictates which CDN works.** `script-src` allows
   `cdn.jsdelivr.net` but **not** `unpkg.com`; a `HEAD` 200 does NOT mean the
   browser will execute it. `model-viewer` must load from jsdelivr.
7. Prior notes that still hold: local `next lint`/`next build` can hang in a
   sandboxed shell — use `tsc --noEmit` + `vitest run` as the real local gates
   and let GH Actions be authoritative; worktree `.env.local` has empty
   provider keys, so only deployed envs can generate.

## Blockers / human boundaries

- **No blockers on code work** — the env-var blockers are resolved.
- Anything that **spends provider credits** or **mutates production data**
  still needs the founder's explicit go-ahead.
- Commit/push/merge to `main` was explicitly authorized for this batch; Vercel
  auto-deploys on merge to `main`. Re-confirm before the next merge.

## Next exact action

**Verify the live deploy end-to-end.** This is the one thing that cannot be
done without a real, paid generation, and every deferred item depends on it:

1. Open the deployed app → generate one asset.
2. Confirm in order: tray shows a **real thumbnail** (P2) → say **"make it"** →
   it should ASK, not regenerate (P1) → say **"make it a teapot"** → it should
   ASK TO CONFIRM before spending (P1) → tap a **free-edit chip** ("matte
   black") → applies instantly with no generation (R4 #5) → check the **"N/10
   gens left today"** meter (R4 #19) → **Share** → open the link on a phone →
   **"View in your space"** (P3).
3. Open an OLD library asset that previously 502'd → confirm it either loads
   (Blob mirroring now on) or shows the **re-generate banner** (R4 #20).

Then continue `docs/PRODUCT_STRATEGY_2026-07.md` §6, in this order:
**#8 `.usdz`** (completes iOS AR in shares — the biggest gap left in P3),
**#9 Shopify AR** (revenue wedge; a Shopify connector is available),
**#20 mirror GLBs at generation time** (only if 502s survive step 3),
**#6** (edit-vs-new for bare nouns — HOLD, friction risk, founder's call),
then #10, #11, #14, #15, #17, #21, #22.

## Still open from earlier sessions (unchanged)

- Phase 10b — generation queue to kill the 300s serverless ceiling (needs a
  Supabase migration). Phase 11 Meshy retexture **PR #14 still open**, never
  exercised live (needs a funded `MESHY_API_KEY`; 402/403 = billing, not code).
- Dead-code cluster still unresolved; each needs its own import trace before
  deletion: `lib/agent/*`, `lib/brief/*`, `lib/critic/*`, `lib/cursor/*`,
  `lib/memory/*`, `lib/seo/*`, `lib/telemetry/*`, `project-persistence.ts`,
  `supabase-projects.ts`, `timeline-snapshots.ts`, `router.ts`,
  `project-slug.ts`. (NOTE: `lib/security/*` and `lib/billing/*` are **no
  longer dead** — P5 wired the limiter and budget into the live guard.)
- The scan platform is still unreachable from `/app` (no nav link); its purpose
  should be clarified with the product owner rather than assumed.
