# YIIYA — Product Strategy & Round‑3 Report

_2026‑07‑17 · voice‑first 3D generation · solo founder, zero‑budget backends_

This report answers the founder's questions (market fit, generation quality vs
competitors, rate‑limit economics, "what do you do with the asset after"), lists
what shipped this session, and gives a ranked roadmap of 20+ novel improvements.
It ends with **What only you can do** — the decisions and infra a person, not an
agent, has to own.

---

## 0. What shipped this session (5 merged‑ready fixes)

| # | Fix | Why it matters | Evidence it addresses |
|---|-----|----------------|-----------------------|
| P1 | **Stop paid regeneration on cut‑off/ambiguous voice edits** | The single most expensive misfire. "make it…" (voice cut off) silently spent a full generation and produced a *new* object. Now: contentless → ask to finish (free); substantive edit → **confirm before spending**. | "I tried to change the colour and it gave me a whole new lamp" |
| P2 | **Real previews in the tray + fixed blank library posters** | Canvas lacked `preserveDrawingBuffer`, so thumbnails captured a blank frame; capture was also gated on a Supabase id, so anonymous users got nothing. Now every asset shows a 256px thumbnail, no infra required. | "previews of everything a user has built"; cousin's "no preview" screenshots |
| P3 | **Public 3D viewer + shareable AR links** | The answer to "what do you do with it after?". Every asset gets a URL you can text anyone; they see it orbiting in‑browser and tap **View in your space** for AR. | cousin: "what does a user do with the 3D asset after?" |
| P4 | **Square‑pad the isolated capture + honest guidance** | Tight, non‑square crops make image‑to‑3D models misjudge proportions and clip. Squaring + centering is the cheapest quality lever. Plus honest steering to Orbit mode and a people/faces caveat. | "the capture is so bad… generate me in full 3D" |
| P5 | **Real daily free‑generation quota (revived dead limiter)** | The `generate3d` limiter was dead code — never called. Now a per‑user **daily quota** you can tune with one env var, plus the $ budget as a hard backstop. | "how many generations before rate‑limited, and can we raise it cheaply?" |

All five typecheck clean and the suite is green (83 tests, +11 new). Commits are
on branch `feat/novel-tool-round-3`.

---

## 1. Why YIIYA should exist (the market‑fit thesis)

**The honest starting point:** the 3D‑generation *model* layer is commoditised.
Meshy, Tripo, Luma Genie, Rodin, and YIIYA all sit on the same small set of
backends (Hunyuan3D, TRELLIS, Tripo, Meshy). You cannot win on mesh quality —
you rent the same engines your competitors rent (and Rodin, tuned for
photorealism, out‑renders all of them). So YIIYA's reason to exist **cannot be
"better meshes."** It has to be a different *job‑to‑be‑done*.

**Who is underserved.** Every incumbent is built for people who already know they
want a 3D model and know what a 3D model is: game devs, 3D artists, product
teams. Their UIs are credit dashboards and parameter panels. The person they do
**not** serve is the one who thinks *"I want that thing, in 3D, now"* and cannot
name a topology budget, a PBR workflow, or a file format.

**YIIYA's wedge = the input and the loop, not the mesh:**

1. **Voice‑first, vague‑prompt‑friendly.** "a vintage brass lamp" → asset, no
   form. Vagueness is a *feature* (the Director fills gaps and asks when unsure).
2. **Conversational instant editing.** "make it matte black", "bigger", "chrome"
   apply in‑browser in <1 frame, **0 tokens, $0** — no regeneration. No
   competitor gives you a free, instant, spoken edit loop on the mesh you're
   looking at.
3. **Point‑and‑walk capture.** Tap an object through your phone camera, walk
   around it, get real geometry — no "upload 4 clean studio photos" ritual.
4. **A destination (new this session).** A share link + AR "view in your space"
   turns the asset from a dead file into something you can *show someone*.

That is a **consumer / prosumer creativity** product, not a game‑asset API. The
comparison set that matters is less "Meshy vs Tripo" and more "the 3D equivalent
of what Canva did to Photoshop" — collapse the expertise, keep the magic.

**Pain points it actually removes:**

- "I don't know the words for what I want" → talk to it.
- "Editing means re‑generating and waiting and paying again" → instant free edits.
- "I need a clean product photo to get a model" → point your camera and walk.
- "I got a .glb… now what?" → a link anyone can open and drop into their room.

---

## 2. Generation quality vs the market (grounded, 2026)

From current comparisons (see Sources): everyone draws from the same well.

| Tool | Backend / model | Free tier (2026) | Notable |
|------|-----------------|------------------|---------|
| **Meshy** | own + open models | ~200 credits/mo, $20 Pro | best "all‑round game asset" reputation |
| **Tripo** | Tripo v3 | ~300 credits/mo, 15 dl, $19.90 Pro | fastest (seconds), sculpture‑level precision |
| **Luma Genie** | own | free w/ daily limits, ~$7.99 | strong geometry + texturing, consumer‑leaning |
| **Rodin** | Rodin 2.0 | up to $99/mo | **highest raw photorealism**, hard‑surface/metallics |
| **TRELLIS‑2** | open (MIT) | free/open | best free open PBR; Gaussian‑splat textures |
| **Hunyuan3D 2.1** | open | free/open | **highest‑fidelity open texture/PBR** |
| **YIIYA** | Hunyuan3D → TRELLIS → Tripo → Meshy cascade | **10/day (new, tunable)** | same engines; wins on input UX + edit loop + share |

**Takeaway:** YIIYA's raw output is at rough **parity with the free/mid tier**
(it *is* Hunyuan3D/TRELLIS/Tripo under the hood). It is **not** at Rodin's
photorealism ceiling, and it should not pretend to be. Modern single‑image
tools hit ~80–95% shape accuracy **on the front‑facing surface** — which is
exactly why your capture selfie came back as a distorted white bust: a single
front photo of a *human* (the hardest category) gives the model nothing about
the back, and object‑trained models don't understand people. That is a model‑
class limitation shared by every tool here, not a YIIYA bug (P4 mitigates the
*framing*; true human avatars are a separate pipeline — see §7).

---

## 3. The real differentiator (say this in one sentence)

> **"Say it or point at it, watch it become 3D, and change it just by talking —
> then send someone a link they can drop into their room."**

Mesh quality is table stakes you rent. The moat is the **conversation + capture +
destination loop**, and the fact that a non‑technical person can complete it out
loud in under a minute. Everything on the roadmap should widen that moat, not
chase Rodin's specular highlights.

---

## 4. "What do you do with it after?" — the destination problem

Your cousin's question is the most important product feedback in the batch. A
3D asset with nowhere to go is a toy. The generic answers (download GLB/OBJ/STL
for Blender/Unity/Unreal/3D‑print) only matter to people who already own those
pipelines — i.e. **not YIIYA's user**. For everyone else the destination has to
come *to* them:

- **Shipped (P3): share link + AR "view in your space."** The lowest‑cost,
  highest‑delight destination. You text a link; they see it in 3D and in AR. No
  app, no account.
- **Next (ranked in §6): embeddable viewer** (a 3D image you can paste into
  Notion/a listing/a slide), **AR product try‑on for sellers** (there's a
  Shopify connector available — a real revenue path), **print‑on‑demand /
  order‑this‑printed**, and **`.usdz` for native iOS AR**.

The strategic point: **the destination is where money and virality live**, not
in the generator. A shared AR link is also your cheapest growth loop — every
share is an ad that ends on "Make your own →".

---

## 5. Rate‑limit & cost economics (the numbers you asked for)

**Before this session**, "how many generations does a normal user get?" had no
clean answer:

- `interpret` limiter: **30 requests / 5 min** per identity — a burst guard that
  counts *everything* (edits, clarifications, generations), not a generation cap.
- `generate3d` limiter (5/hour): **dead code — never called anywhere.**
- Daily **$ budget**: `$1.00/user/day`, `$10/day global` — only enforced with
  Supabase or the in‑memory fallback. This was the *only* real cap, and it's a
  dollar figure, not a count a user can understand.

**After P5**, the cap a user feels is explicit and cheap to run:

- **`YIIYA_FREE_GENERATIONS_PER_DAY` (default 10)** per identity / 24h, live in
  the guard, with a friendly "you've used your 10 free generations, resets in
  ~Nh" message. Exempt emails (you) skip it. The $ budget stays as a hard
  backstop behind it.

**Cost math (per your provider economics notes):**

| Provider path | Approx cost/gen | 10/day/user costs you |
|---|---|---|
| Turbo / cheap open (HF) | ~$0.017 | ~$0.17/day |
| Hunyuan3D standard | ~$0.02–0.05 | ~$0.20–0.50/day |
| Multi‑view / premium | ~$0.16–0.31 | ~$1.60–3.10/day |

**How to raise the number without pain:** the free tier is one env var. But the
lever that actually protects margin is **routing**, not the count:

1. Keep the **cheap providers first** in the cascade for free‑tier users
   (turbo/Hunyuan), reserve multi‑view for paid or for Orbit captures.
2. Cache aggressively — identical prompt → served from library, **0 cost** (the
   "from your library, no generation spent" path already exists).
3. Because **local edits are free and instant**, every edit a user makes by
   voice instead of regenerating is pure margin. The more you push the
   conversational loop, the cheaper each satisfied user gets. **Cost control and
   the differentiator are the same feature.**

Recommendation: default free tier **10/day**, bump to 15–20 for signed‑in users,
unlimited for you, and gate multi‑view behind Orbit or a (future) paid tier.

---

## 6. 20+ novel improvements, ranked by (leverage ÷ cost)

Legend: **[S]** shipped this session · **[N]** next / cheap · **[M]** medium ·
**[B]** big/handoff. Grade = confidence it moves the needle (A best).

### Tier 1 — widen the core loop (do next)
1. **[S] Confirm‑before‑paid‑regen gate** (A) — done (P1).
2. **[S] Tray/library thumbnails** (A) — done (P2).
3. **[S] Share link + AR view** (A) — done (P3).
4. **[N] Undo / "revert to previous mesh"** (A) — every asset already survives in
   the tray; expose one‑tap "go back" so experimenting is consequence‑free.
5. **[N] Suggested next edits as chips** (A) — after a gen, offer 3 spoken‑style
   chips ("matte black", "bigger", "add a handle") so users learn the free edit
   loop instead of accidentally regenerating. (Brief already carries suggestions.)
6. **[N] "Did you mean edit or new object?" for bare nouns** (A) — extend P1's
   classifier so "a red car" while an asset is active offers *edit this* vs
   *new object* instead of silently branching.
7. **[N] Embeddable viewer / OG 3D preview** (A) — the /view page + an OG image so
   a shared link unfurls as a spinning preview in iMessage/Discord/Slack.

### Tier 2 — destinations & virality
8. **[M] `.usdz` export for native iOS Quick Look** (A) — unlocks true iOS AR in
   the share link (currently Android AR + desktop orbit only). Needs a GLB→USDZ
   step (see §7).
9. **[M] Shopify "add to store in AR"** (A) — a Shopify connector is available;
   "generate a product → publish it as an AR‑viewable Shopify product" is a real
   revenue wedge and a concrete answer to "what's it for."
10. **[M] Order‑this‑3D‑printed** (B) — hand the STL to a print‑on‑demand API;
    "see it, print it, it arrives." Strong consumer hook.
11. **[M] Public gallery / remix** (B) — opt‑in feed of shared assets with
    "remix this by talking to it." Virality + cold‑start content.
12. **[N] "Copy link" everywhere + native share sheet** (A) — extend P3's share
    to the in‑app tray, not just the library.

### Tier 3 — capture & quality
13. **[S] Square‑pad isolated capture** (A) — done (P4).
14. **[N] Mask feather/erosion on the cut‑out** (B) — soften hard silhouette
    edges before handing to the generator; reduces jagged reconstructions.
15. **[M] Multi‑tap multi‑object capture** (B) — tap several objects, isolate the
    set, generate a small scene.
16. **[M] Auto‑retry with a different provider on degenerate output** (A) — you
    already validate GLBs; on a bad mesh, silently re‑route to the next provider
    before showing the user.
17. **[B] Human/avatar pipeline** (C) — genuinely different tech; see §7. Until
    then, detect a person and set expectations (P4 does the honest‑copy half).

### Tier 4 — trust, retention, ops
18. **[N] Generation history *is* the chat** (A) — you now scope logs per asset
    (this session's earlier work); surface it as a per‑asset conversation with
    replayable edits.
19. **[N] "X/10 free generations left today" meter** (A) — show the P5 quota in
    the UI so limits never surprise; nudge sign‑in for more.
20. **[N] Real error copy for the 502 past‑asset loads** (A) — expired Tripo
    signed URLs 502 through the proxy (visible in your console). Mirror finished
    GLBs to Vercel Blob at generation time so past assets never rot (verified
    play: never hand the client an ephemeral provider URL).
21. **[M] Onboarding first‑run: 10‑second "say this" demo** (A) — first visit
    auto‑runs one example so the magic lands before the user has to think.
22. **[N] Analytics on the funnel** (B) — capture→generate→edit→share drop‑off,
    so the roadmap is driven by real behaviour, not vibes.

**If you do only three next:** #5 (edit chips — teaches the free loop, protects
margin), #8 (USDZ — completes iOS AR in shares), #20 (durable GLB mirroring —
stops past assets 502‑ing). Those three make the tool feel finished.

---

## 7. What only YOU can do (handoffs, decisions, infra)

Per honest‑handoff discipline, here is what an agent could **not** do or decide:

**Infra / secrets (blockers I cannot set):**
- **`BLOB_READ_WRITE_TOKEN` in Vercel** — the durable library posters (P2's
  cross‑device thumbnails) and future GLB mirroring (#20) need Vercel Blob. The
  in‑session tray previews work without it; the persistent library ones don't.
- **`YIIYA_FREE_GENERATIONS_PER_DAY`** — pick the number (I defaulted 10). Set it
  in Vercel env; no deploy needed to change later.
- **Upstash Redis** — the daily quota and rate limits use an in‑memory fallback
  that is per‑instance and resets on redeploy. For real multi‑instance
  enforcement, add Upstash (free tier is enough).
- **Provider billing** — a 403 from a paid provider is a *card/key* problem, not
  code. Confirm Tripo/Meshy keys are funded before blaming the cascade.

**Product decisions only you own:**
- **Free‑tier generosity vs burn** (§5): 10/day free, more for signed‑in, gate
  multi‑view? Your call on the growth/margin trade.
- **Which destination to bet on first** (§4/§6): share‑link virality vs Shopify
  revenue vs 3D‑print. I'd sequence share → USDZ → Shopify.
- **Whether to chase human avatars at all** (#17). It's a real, separate model
  pipeline (photo→avatar), likely with cost. My recommendation: **don't** — it
  dilutes the "objects, instantly, by voice" story. Steer people to objects
  (P4 does this honestly) rather than half‑supporting a hard case.

**Verification I could not complete (dev‑environment limits, not code):**
- The P3 `/view` page's in‑page 3D render was blocked by dev‑server chunk caching
  (stale `page.js`). The *mechanism* is verified — the allowlist accepts the
  src, and the jsdelivr module defines `model-viewer` in‑browser — and both
  compiled chunks reference jsdelivr. It will render for real visitors on Vercel
  (content‑hashed chunks). Confirm once with a real shared link after deploy.
- P1's confirm gate, P2's thumbnail capture, and P4's square crop are only
  reachable after a real (paid, minutes‑long) generation, so they're covered by
  unit tests + construction rather than a live run. Do one end‑to‑end pass after
  deploy: generate → see tray thumbnail → say "make it" (should ask, not
  regenerate) → say "make it a teapot" (should confirm) → share → open the link.

---

## 8. Session scorecard (1–5)

- **Product lift: 5** — five user‑visible fixes, each tied to a specific user
  complaint, all merge‑ready with green tests.
- **Evidence quality: 4** — every phase cites a user quote/screenshot or a code
  fact (dead limiter, missing `preserveDrawingBuffer`, CSP‑blocked CDN). Docked
  one for the live‑render verification gap (honestly reported above).
- **Token efficiency: 4** — biggest waste was fighting dev‑server/browser chunk
  caching on P3; next time, restart the dev server *before* browser verification,
  not after three stale reads.
- **Model‑agnostic transfer: 5** — this report + the branch commits + the task
  list let any model resume from here.

**One‑line next action:** set `BLOB_READ_WRITE_TOKEN` + `YIIYA_FREE_GENERATIONS_
PER_DAY` in Vercel, deploy `feat/novel-tool-round-3`, then do the §7 end‑to‑end
pass and ship roadmap #5, #8, #20.

---

### Sources (competitor/quality research, 2026)
- Sloyd — 3D AI price comparison: <https://www.sloyd.ai/blog/3d-ai-price-comparison>
- Costbench — Tripo pricing 2026: <https://costbench.com/software/ai-3d-generation/tripo-ai/>
- Costbench — Meshy pricing 2026: <https://costbench.com/software/ai-3d-generation/meshy/>
- Trellis2 — best AI 3D generators 2026: <https://trellis2.app/blog/best-ai-3d-model-generator>
- 3DAI Studio — best image‑to‑3D tools 2026: <https://www.3daistudio.com/3d-generator-ai-comparison-alternatives-guide/best-image-to-3d-tools-2026>
- Toolworthy — Luma Genie review 2026: <https://www.toolworthy.ai/tool/luma-ai-genie>
