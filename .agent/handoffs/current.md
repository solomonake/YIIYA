# Current agent checkpoint

Generated: 2026-07-21 (Claude session — **phone-companion orbit (a) built on
branch `feat/phone-companion-orbit`, NOT merged**). **Next phase: fast-preview
tier (b) or `/app` UX overhaul (c) — founder's call.**

> Read this + `git fetch origin` first. The local checkout goes stale silently.
> Strategy source: `docs/PRODUCT_STRATEGY_2026-07.md`. Merge to `main`
> auto-deploys to Vercel prod — re-confirm with the founder before each push.
>
> **Uncommitted-to-main:** phone-companion orbit lives on branch
> `feat/phone-companion-orbit` (commit `b037ea8`), awaiting founder review before
> merge/push. `git checkout feat/phone-companion-orbit` to continue it.

## State — what shipped this session (all on `main`, deployed)

Commits `94005c4..2f7588e`:

| Commit | Shipped |
|--------|---------|
| `a4d3080` | Realism phases 1-3 + free-first cost mode in the `/app` cascade (`lib/interpret-pipeline.ts`): TRELLIS 2048 textures for high-poly; opt-in fal-Hunyuan octree/steps knobs; `isPersonSubject()` face routing + a `[CAPTURE]` "use Orbit" tip; Rodin provider (opt-in `FAL_ENABLE_RODIN`); `YIIYA_FREE_FIRST=1` tries free HF/Tripo/Meshy before paid fal. |
| `f234161` | Real pycolmap SfM→dense→Poisson reconstruction in the Modal worker (`services/reconstruction_worker/modal_app.py`), flag-gated `YIIYA_ENABLE_COLMAP`, fully guarded fallback. `COLMAP.md` spec. |
| `2f7588e` | **Device-aware + guided orbit** (`app/capture/page.tsx`): orbit offered only on mobile (`pointer:coarse`/UA), device-correct camera facing, progress ring + directional coaching, explicit retry. Portable `Dockerfile.colmap` + `server.py` + `DOCKER.md` for Cloud Run GPU. |

**Proof:** `tsc --noEmit` clean; 127/127 vitest; `modal_app.py`/`server.py`
py_compile OK.

**NOT verified (needs founder — device + credits):** live orbit visuals
(ring/coaching), any generation quality delta, the Rodin/Hunyuan fal schemas,
the trimesh repair (Modal-only), the COLMAP container (needs the built GPU
image). All are gated/guarded so a wrong assumption degrades, never breaks the
working single-image path.

## SHIPPED (on branch, not merged) — Phone-companion orbit (option a)

Branch `feat/phone-companion-orbit`, commit `b037ea8`. Awaiting founder merge.

**What was built (exactly the design below):**
- `lib/capture-session.ts` — Upstash-backed session store (`createSession`,
  `getSession`, `putSession`, `submitSessionViews`), 600s TTL, in-memory
  dev/test fallback. URLs only in KV, never base64. Tests:
  `lib/capture-session.test.ts` (9) + `lib/capture-session-route.test.ts` (5).
- `app/api/capture-session/route.ts` (POST create → `{id, captureUrl}`) and
  `app/api/capture-session/[id]/route.ts` (GET poll → `{status, views}`, 404 on
  expiry; POST submit accepts hosted URLs OR base64 frames hosted server-side).
- `lib/vercel-blob.ts` — added reusable `uploadImageToBlob()`.
- `app/capture/page.tsx` — companion mode: `?session=<id>` diverts a successful
  orbit to the session ("Sent to your laptop ✓") instead of local navigation;
  header shows "· LINKED TO LAPTOP".
- `components/phone-companion-orbit.tsx` + `components/yiiya-workspace.tsx` —
  laptop-only "📱 Orbit with phone" button (below the ref drop zone) → QR modal
  (`qrcode.react` dep added) → polls every 2s → hydrates views → sets a
  multi-view `ReferenceImage` → fires the SAME `?autoGenerate=1` path.

**Acceptance criteria — status:**
- [x] Laptop shows a scannable QR; phone opens straight into the orbit flow
      (LINKED banner + companion submit wired).
- [x] Data path proven end-to-end LIVE (dev server): laptop button → QR modal →
      simulated phone submit → laptop detected ready → set `orbit-front.png`
      (+additionalViews) → fired the generation cascade. Stopped at "No 3D
      provider configured" — expected locally.
- [x] Session expires cleanly; stale/invalid id → 404 → friendly retry.
- [x] URLs only in Redis; QR carries only the opaque id.
- [x] Single-image + mobile-native orbit paths untouched.

**Proof:** `tsc --noEmit` clean; `next lint` clean; **141/141 vitest** (was 127).

**NOT verified (needs founder — device + credits):** real phone-camera orbit
(camera-gated), the resulting mesh quality on a deployed env, and the
base64→Blob submit path (needs `BLOB_READ_WRITE_TOKEN`; the hosted-URL submit
shape is what the live test used). Upstash keys must be set in prod so sessions
survive across serverless instances (the in-memory fallback is single-process).

## (superseded design notes — Phone-companion orbit)

**Goal (falsifiable):** A laptop user clicks "Orbit with phone", scans a QR with
their phone, walks around the object on the phone, and within ~10s the laptop
`/app` auto-generates from the 3 orbit views — no app install, no cable.

**Why this / evidence:** Founder's laptop demos can't orbit (fixed webcam), so
recruiter demos are stuck on hallucinated single-image busts. This unlocks
orbit-quality on the laptop, which is the recruiter story. Latency is NOT a
blocker: nothing is streamed — the phone does the orbit + segmentation locally
and only uploads 3 finished PNGs; the laptop polls. Seconds, not real-time.

### Design (grounded in existing primitives)

```
Laptop /app  ──"Orbit with phone"──►  create session id  ──►  show QR of
   │                                                     yiiya.app/capture?session=<id>
   │  polls GET /api/capture-session/<id> every 2s
   ▼
Phone opens that URL  ──►  existing /capture orbit flow runs (already built!)
   │  on success, instead of router.push, POST the 3 views to the session
   ▼
POST /api/capture-session/<id>  stores {front,left,back} view URLs (+status=ready)
   ▼
Laptop poll returns ready  ──►  setReferenceImage({...additionalViews})  ──►
   router.push("/app?autoGenerate=1")   (this path ALREADY works — workspace
   consumes it at components/yiiya-workspace.tsx:860)
```

### Exact build list

1. **Session store** — use Upstash Redis (already wired: `@upstash/redis`, see
   `lib/security/rate-limit.ts:20-45` for the client pattern). New
   `lib/capture-session.ts`: `createSession()` → random id, `putSession(id,
   data)`, `getSession(id)`. TTL ~600s. Store `{ status: "pending"|"ready",
   views: string[] }` (blob URLs, not base64 — keep the KV small).
2. **API routes** (mirror `app/api/scan/jobs/route.ts` shape):
   - `POST /api/capture-session` → `{ id }`.
   - `GET  /api/capture-session/[id]` → `{ status, views }` (laptop polls).
   - `POST /api/capture-session/[id]` → phone submits view URLs (validate 3).
3. **Phone upload**: in `app/capture/page.tsx` `handleOrbit`, when a
   `?session=<id>` param is present AND `usable>=3`, upload the 3 view PNGs to
   Blob (reuse the `put` pattern from `lib/interpret-pipeline.ts:579
   uploadImageToBlob` — may need a small `/api/capture-session/[id]/upload` or
   client-side `@vercel/blob` upload), then POST the URLs to the session and show
   "Sent to your laptop ✓" instead of navigating.
4. **Laptop UI**: in `components/yiiya-workspace.tsx` (desktop reference-drop
   area ~line 541-565), add an "Orbit with phone" button → creates a session,
   renders a QR (add `qrcode` dep or a tiny inline SVG QR — prefer a lib), polls,
   and on `ready` fetches the view URLs → base64 → `setReferenceImage({...
   additionalViews})` → `router.push("/app?autoGenerate=1")`.
5. Reuse `app/capture/page.tsx`'s `isMobile` gate so the laptop-only button and
   phone-only submit behavior are correct.

### Acceptance criteria

- [ ] Laptop shows a scannable QR; phone opens straight into the orbit flow.
- [ ] Phone orbit success → laptop auto-generates within ~10s, mesh has real
      geometry (front/left/back), not a guessed backside.
- [ ] Session expires cleanly; a stale/invalid id shows a friendly "expired, retry".
- [ ] No base64 in Redis (URLs only); no secrets in the QR URL beyond the opaque id.
- [ ] Single-image + mobile-native orbit paths untouched.

### First executable action

Create `lib/capture-session.ts` with `createSession/getSession/putSession` over
Upstash (copy the redis() lazy-init from `lib/security/rate-limit.ts:42-45`),
plus a unit test in `lib/capture-session.test.ts`. Then the three API routes.
Build UI last so the data path is proven first.

## Human boundaries — what only the founder can do

- **Env before this works live:** `HUGGINGFACE_TOKEN` (free path), verify Rodin
  in fal playground → `FAL_ENABLE_RODIN=1`. Upstash keys already set (rate-limit
  uses them). Blob token already set.
- **Device testing:** every capture/orbit change needs a real phone + laptop; the
  agent cannot drive a camera.
- **Provider credits:** any live generation-quality check spends fal credits.
- **Modal/COLMAP:** deploying the reconstruction worker + building the CUDA image
  (see `COLMAP.md` / `DOCKER.md`) is founder infra work.

## Backlog (after phone-companion)

- (b) Fast-preview tier: show a low-texture mesh from the first provider in ~15s,
  hot-swap the 2K version — perceived-speed win. Cascade already returns the
  first valid mesh; add a "fast tier first" ordering.
- (c) `/app` workspace responsive/UX overhaul (mobile log panel, touch targets) —
  `components/yiiya-workspace.tsx`, the untouched large surface.
- `.usdz` converter worker (blocked on infra, not code — see prior notes).
- Frame segmentation before COLMAP SfM (rembg/SAM) for cluttered backgrounds.

## Operating notes that still hold

Machine-load triage before code triage (`uptime` first; this session ran at load
~16 — serialize tsc/vitest, never run them in parallel). `tsc --noEmit` +
`vitest run` are the real local gates. Only deployed envs generate (local
provider keys empty). On-device MediaPipe segmentation runs in the browser, not
the server. Capture/orbit changes are camera-gated → verify on a real device and
report the gap; do not claim live-verified without one.
