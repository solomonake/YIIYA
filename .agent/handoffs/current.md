# Current agent checkpoint

Generated: 2026-07-06 (claude-opus-4.8 session)

## State
- Branch: `claude/reverent-wiles-0b7f37` (worktree). NOT deployed.
- Local dev server runs clean on 127.0.0.1:3000 (`/app` → 200, no console
  errors). Worktree `.env.local` has EMPTY provider keys, so live generation
  can't run locally; production (yiiya.vercel.app) has the real keys.
- Full plan of record: `docs/TRANSFORMATION_PLAN.md`. Read it first — it holds
  the audit table, the 2026 open-source model stack, and the 7-phase plan.

## Goal
Transform YIIYA into a production-grade, voice-first, mobile-capable 3D studio
on a zero-paid-API stack. This session delivered the audit, the plan, and
Phase 0 (reliability + honesty).

## Completed this session
- **GLB-403 fix (the visible core-loop bug).** New `lib/provider-hosts.ts`
  (SSRF allowlist + HF auth header), new `app/api/3d/proxy/route.ts`. The
  pipeline now serves the winning GLB through the authenticated proxy when
  Blob mirroring fails, instead of a raw `*.hf.space` URL the browser 403s on.
- **Real exports.** `app/api/3d/convert/route.ts` rewritten to do genuine
  GLB→OBJ and GLB→STL via new `lib/scene/mesh-export.ts` (gltf-transform,
  world-transform baking, winding-order STL normals). SSRF-guarded, 100MB cap.
  USD returns an honest 501 unless `USDZ_CONVERTER_URL` is set.
- **Honest pipeline.** `errMessage()` kills `[object Object]` logs;
  `localDirectorBrief()` keeps the pipeline alive without Gemini; failed
  cascades log `[FAILED]` and expose no fake exports; removed the always-on
  "texturing..." lie.
- **TRELLIS.2 official** placed first in the HF tier (endpoints verified).
- `maxDuration=300` on `/api/interpret/stream`.
- UI honesty: AssetCard shows FAILED + "no exports"; accurate boot log.

## Verification proof
- `node node_modules/typescript/lib/tsc.js --noEmit`: exit 0, 0 errors.
- `node_modules/.bin/vitest run`: 14 files, 54 tests passed (8 new).
- curl: proxy rejects `evil.com`/missing param (400); convert rejects
  disallowed host; USD returns the honest 501.
- Reproduced the production 403 first (two live generations, console
  `[GLB-VIEWER] Could not load ... 403`).
- Local `/app`: 200, zero console errors, corrected boot log rendered.

## Next exact action
With human approval, deploy this branch to a Vercel **preview** (not prod),
generate "a red apple", and confirm in the browser console that the viewer
loads the GLB via `/api/3d/proxy` or Blob with **no 403**, and that a
downloaded `.OBJ`/`.STL` opens in Blender. If green, begin **Phase 1**
(`docs/TRANSFORMATION_PLAN.md`): Supabase migration `0005_assets.sql`, auth,
save-on-generate, and the `/library` screen.

## Blockers / boundaries
- No deploy/credentials/merge authority granted — human approval required.
- Live proxy/mirror path proven at unit+route level only; needs one real
  generation on a keyed environment to fully confirm.

## Do NOT regress
- Never hand the R3F viewer a raw provider URL (mirror or proxy).
- Never advertise an export format `/api/3d/convert` can't actually produce.
- Keep `npm run typecheck` and `vitest run` green; run them backgrounded with
  an `EXIT=` sentinel, not a blocking foreground shell.
