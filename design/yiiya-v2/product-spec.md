# YIIYA v2 — product specification

Status: design proposal, 2026-10-10. Nothing here is shipped. Every feature is
tagged **Working** (exists in the repo today), **Partial**, **P0–P3** (proposed,
by priority), **Blocked**, or **Off**. The clickable prototype shows the
"Current" view by default; its *Capability view* switch shows proposed P1/P2
behaviour, always tagged in the UI.

## 1. Primary jobs

| Job | Who | Today's pain (see audit) |
| --- | --- | --- |
| Turn a description or one photo into a 3D draft I can look at | Students, makers, indie creators | Mobile has no visible input (A1); starters hidden (A2) |
| Refine it by talking and by pointing at a part | Same | Terminal log (A3), click-only selection (A11), short memory (A9) |
| Keep what I like while changing something else | Same | Regeneration rebuilds everything (A10); undo jumps assets (A8) |
| Get a file that opens in my tool, knowing what's checked | Same | Edits not in downloads (A7), STL units (A20), overclaims (A16) |
| Come back later and continue | Same | Library is assets-only, account-only (A19) |

**Initial success case:** one object (the desk lamp) created, refined over ten
conversational turns, restored after reopening, and exported.

## 2. Scope

In: desk objects, props, simple product concepts; text, voice dictation and one
photo; instant appearance edits; regenerated versions with comparison; honest
readiness; GLB/OBJ/STL export; browser and account persistence; read-only share.

Out of onboarding (shown only as honest boundaries): characters and likeness,
rigging and animation, manufacturing, multi-view reconstruction, CAD-grade
dimensions. Not designed: subscriptions/paywalls, marketplace, social feed,
teams, enterprise controls.

## 3. Success criteria (measurable)

| Criterion | Measure | Target (proposed) |
| --- | --- | --- |
| First draft without help | % of new sessions that submit a prompt or photo within 60 s of opening the studio, on desktop and phone | ≥ 70 % (baseline: measure current) |
| Ten-turn success case | Scripted test: lamp created, 10 turns, reload, restore, export opens in Blender | Passes on Chrome, Safari, Firefox desktop + iOS Safari |
| Local edit latency | Input → visible change for an instant edit, mid-range laptop (M1 Air, Chrome) and mid-range phone (Pixel 6a) | p95 < 200 ms |
| Conversational response start | Send → first assistant token / card, with Gemini reachable, wired broadband | p50 ≈ 1–2 s (measure; not a promise) |
| Honest failures | % of failed generations that end in a specific failure state (not a spinner or placeholder asset) | 100 % in automated tests |
| Preserved work | Failed or cancelled generation never changes the current version | 100 % in automated tests |
| Accessibility | All journeys completable by keyboard only and by touch only; axe: 0 serious issues | Required |

GPU generation time: report measured p50/p90 per HF Space; never show an SLA.

## 4. Information architecture

```
/ (landing)
├── /app (studio) ─────────── sheets: New project · Start from a photo · Export · Share
│     │                                Settings · Account · Help · Compare · Rename · Save status
│     ├── conversation  (desktop left column · tablet/phone "Chat" tab)
│     ├── canvas        (always primary)
│     └── inspector     (Brief · Part · Versions; desktop right column, tabs elsewhere)
├── /projects (replaces /library)     sheet: Delete confirm
├── /capture (phone; ?session=<id> when paired with a laptop)
├── /view (public read-only viewer)
└── /auth/callback (email-link landing: verifying · expired · success)
```

No new routes beyond renaming `/library` → `/projects` and adding the auth
callback page; everything else is a sheet or panel.

### Navigation map

| From | Action | To |
| --- | --- | --- |
| Landing | Start (typed prompt or starter) | Studio, generation starts |
| Landing | Start from a photo | Desktop: Studio + photo sheet · Phone: /capture |
| Studio | Projects | /projects |
| Studio | Export / Share / Settings / Help / Account | Sheet (focus returns to the trigger on close) |
| Projects | Open | Studio with restored conversation, versions, brief |
| Laptop photo sheet | Use your phone → QR | Phone /capture?session=… → photo → laptop "Photo received" |
| Share link | Open | /view (read-only) |

## 5. Interaction model

### 5.1 Four action types (visible and behavioural)

| Type | Badge | Behaviour contract | Today |
| --- | --- | --- | --- |
| **Instant edit** | green, lightning | Applies in < 200 ms, no generation, appears in History, undoable. Colour can target a selected part; finish/scale apply to the whole object. | **Working** in viewer (`lib/scene/local-edit.ts`); not in downloads (A7) |
| **New version** (generative revision) | amber, layers | Confirm card names target, keep-list and "may change". Runs as a generation. Current version stays in use until the user picks after **Compare**. | **Partial**: confirm exists; compare/keep missing |
| **Exact edit** (parametric) | violet, ruler, "Proposed · P2" | Changes a named parameter (neck radius, overall height) validated by code; locked parts verified unchanged. | **P2** — needs parametric geometry |
| **Not available** | neutral, ban | One-sentence reason + a workable next step. Never a silent regeneration. | **Partial** (contentless guard exists) |

The composer previews the likely type while typing (mirrors
`classifyEditIntent`), so users know before sending whether something is
instant or uses the GPU queue.

### 5.2 Design brief (P1)

A persistent, editable record: object, parts, size (value + unit + basis:
*estimated* / *exact*), materials, style, destination, references, **keep
requirements**, open questions, version history. Sent with every request;
"keep the shade the same" becomes a requirement automatically. In current
mode the panel is shown with a P1 tag and explains that the assistant only
reads the last 3 messages today.

### 5.3 Selection

- Canvas click/tap selects; parts list selects (keyboard, screen reader);
  `Esc` clears. Selected part shows: canvas outline (blue + adaptive halo),
  canvas label, composer chip "Selected: Neck", and is attached to the next
  message ("On: Neck").
- Today selection is a geometric region around the click; the parts list is
  the P2 named-parts version. Achievable now (P0/P1): "pick region at view
  centre" for keyboard users.

### 5.4 Versions, history, undo

- Versions = generated meshes (v1, v2…), never failures. Each lists kind
  (Generated / Regenerated / Exact edit), source version, and in-use state.
- History = instant edits + version switches; Undo/Redo walk it. Copy states it
  is not a CAD operation history.
- "Undo that" right after a revision declines the pending version.
- Compare always shows the request that produced the new version ("You asked: …")
  and states that YIIYA can't confirm the change automatically yet (P0 copy;
  automatic request verification would be P2).
- Placement/scene requests ("put it on a desk") are *Not available* — YIIYA
  makes one object at a time — instead of triggering a regeneration (P0
  routing change in `classifyEditIntent`).

### 5.5 Generation lifecycle

Phases (real names, no percentages): Preparing → Waiting for a free GPU →
Generating 3D model → Checking the file → (*Draft ready*, P1) → Finishing
materials & exports → Done. Elapsed time is shown (measured). Instant edits
keep working during a generation. Stop/cancel and all failure states are in §6.

## 6. Journeys

Each step links a prototype scenario (`prototype/index.html#/<route>?scenario=<id>`).

### A. First useful object
| Step | Screen / state | Scenario |
| --- | --- | --- |
| 1 | Landing: honest example, typed prompt or photo, limits | `landing` |
| 2 | Studio empty: starters, no account needed | `studio-empty` |
| 3 | Clarify only consequential ambiguity ("desk or floor lamp?") | `studio-clarify` |
| 4 | Generation phases | `gen-preparing` → `gen-queued` → `gen-generating` → `gen-validating` → `gen-finishing` |
| 5 | Draft v1 | `studio-v1` |
| 6 | Instant finish change | `studio-local-edit` |
| 7 | Export with checks | `export-render` |

### B. Natural refinement with selection
| Step | Scenario |
| --- | --- |
| "Make a compact desk lamp with a curved brass neck and a dark green shade." | `studio-v1` |
| Select the neck → composer chip, part controls | `studio-selected` |
| "Make this thinner, but keep the shade exactly the same." — while typing, preview says *New version* | `studio-typing-preview` |
| Current: honest regeneration card with keep-list and "may change" | `studio-revision-current` |
| Future: exact edit card (P2) | `studio-revision-proposed` |
| Result: compare v1/v2; the shade drifted and is flagged against the keep request | `studio-compare` |
| "Undo that. Make it 35 centimetres tall." → keeps v1, scales to ≈35 cm (estimated) | `studio-undo-height` |
| Future: 350.0 mm exact constraint (P2) | `studio-height-proposed` |

### C. Interrupted generation
| Step | Scenario |
| --- | --- |
| Queued on shared GPU | `gen-revision-queued` |
| Connection drops — current: "can't be resumed", previous version safe, Start again | `gen-interrupted` |
| Proposed P1: reconnecting → job restored → result | `gen-reconnecting` → `gen-restored` |

### D. Free quota unavailable
| Step | Scenario |
| --- | --- |
| HF capacity unavailable: work unchanged, instant edits work, Try again, optional own token, no reset time | `gen-failed-quota` |
| YIIYA daily limit (reset time supplied by YIIYA) | `gen-daily-limit` |
| Server not configured / Spaces not responding / invalid mesh | `gen-missing-setup`, `gen-asleep`, `gen-invalid` |
| Token in Advanced settings with storage/transmission copy | `settings-generation` |

No checkout, no upgrade prompt, no automatic paid fallback.

### E. Capture and device handoff
| Step | Scenario |
| --- | --- |
| Desktop upload with single-image note | `capture-upload` |
| QR pairing → photo received → attached in composer | `capture-qr` → `capture-received` → `capture-ref-attached` |
| Pairing code expired | `capture-qr-expired` |
| Phone: permission ask, framing, low light, denied → upload, review, uploading, failed → retry, sent, expired, invalid | `phone-capture-*` |

Free-only mode never asks for a walk-around; "Why only one photo?" explains.

### F. Return and export
| Step | Scenario |
| --- | --- |
| Projects (signed in / signed out / empty / loading / error / rename / delete) | `projects*` |
| Open → conversation (10 turns), 3 versions, brief restored | `studio-restored` |
| Compare variants | `studio-compare` |
| Export by destination; verified / needs work / not checked | `export-render`, `export-print` |
| Conversion running / failed / file expired / proposed baked edits | `export-converting`, `export-failed`, `export-unavailable`, `export-proposed` |
| Share: public-link disclosure → link; proposed private publish | `share-current`, `share-created`, `share-proposed` |
| Viewer: ready, loading, unavailable, no-WebGL fallback | `viewer-*` |

## 7. Screen and state inventory

The full index (surface × state × breakpoint, with captures and live links) is
[screens/index.html](screens/index.html), generated from
[screens/manifest.json](screens/manifest.json). Coverage against the brief's
table is in [README.md](README.md#coverage-checklist).

Per primary surface — empty / loading / success / error / disabled / focus:

| Surface | Empty | Loading | Success | Error | Disabled | Focus behaviour |
| --- | --- | --- | --- | --- | --- | --- |
| Studio canvas | Starters + photo + 3 steps | Generation card (phase, elapsed) | Version chip, view tools | Failure card; WebGL/low-memory fallback notice | Export/Share disabled until an object exists | Canvas focusable; arrows/±/0; `/` → composer; `Esc` clears selection |
| Conversation | Guidance list | Assistant card appears; SR status announces phase changes only | Action cards | System line (danger) | Card buttons disabled after a choice, with the outcome noted | Composer keeps focus after send |
| Inspector | "Parts appear after the first draft" | — | Brief/Part/Versions | — | Proposed controls disabled with reason | Tabs: arrow keys; selecting a part moves to Part tab |
| Projects | Empty state + new | Skeleton (aria-busy) | Grid | Account error, browser projects still shown | — | Delete returns focus to search; rename focuses input |
| Export | — | Converting row (spinner + text) | Downloaded | Conversion failed (GLB still available); file expired | USDZ disabled with reason | Opens on title; Esc closes and returns focus |
| Capture (phone) | Permission ask | Uploading | Sent | Denied, upload failed, expired, invalid | — | Primary action focused per step |
| Viewer | — | Loading | Orbit + metadata | Unavailable link; no-WebGL poster | AR disabled while loading | Stage focusable; button alternatives for orbit/zoom |
| Account | Email form | Sending | Sent; signed in | Invalid email; expired link | — | Email field autofocus |

Global: offline banner; expired sign-in banner; save conflict (P1); WebGL
unavailable; low memory; unsaved-in-account indicator (save pill).

## 8. Capability ledger

| Capability | Status | Supporting code (today) | Dependency for proposed part |
| --- | --- | --- | --- |
| Free-only 3D routing, HF allowlist, fail closed | **Working** (local, uncommitted) | `lib/generation-policy.ts`, `lib/interpret-pipeline.ts` L1505–1520 | — |
| Text prompt → 3D via HF Spaces | **Working** (depends on HF capacity) | `lib/interpret-pipeline.ts` cascade L1336–1400 | — |
| One photo → 3D | **Working** | same; `additionalViews` ignored in free-only L1342 | — |
| Clarify gate | **Working** | pipeline `clarify` event; workspace L408–464 | — |
| Regenerate confirmation | **Working** | `classifyEditIntent`; workspace L466–495 | Keep-list + compare: **P1** UI |
| Instant colour/finish/scale | **Working** (viewer only) | `lib/scene/local-edit.ts`, `store.applyLocalMaterialEdit` | Bake into exports: **P1** |
| Part colour by clicked region | **Partial** (not persisted) | `lib/scene/region-select.ts`, `scene-canvas.tsx` L705–735 | Persist region edits: **P1**; named parts: **P2** |
| Part finish / exact part shape | **P2** | — | Part segmentation or parametric templates |
| Exact dimensions | **P2** | — | Parametric geometry + validation |
| Estimated scale display | **Working** | `scaleMeters` from GLB bounds; `materialOverride.scale` | Bake scale on export: **P1** |
| Undo/redo of instant edits & version switches | **P0** (today: asset stepping) | workspace L771–779 | Store op history |
| Versions + compare + keep/use | **P1** | `generatedAssets` array | Version records with `basedOn` |
| Durable, reconnectable generation jobs | **P1** | request-bound SSE `/api/interpret/stream` | Job table/queue, status endpoint, resumable client |
| Draft visible before finishing | **P1** | — | Emit mesh before texture/export packaging |
| Structured brief / memory | **P1** | `activeBrief` (Director output), history slice(-3) | Brief schema persisted + sent each turn |
| Browser persistence | **Working** | zustand persist `yiiya-studio-session` | Project model (not just assets) |
| Account persistence | **Partial** (assets only) | `lib/assets/persist`, `/library` | Projects table, conversation + versions |
| Save conflict detection | **P1** | — | Revision numbers / `updated_at` checks |
| Projects search/rename/duplicate/delete | **P1** | — | Projects API |
| GLB / OBJ / STL export | **Working** | `/api/3d/convert`, `lib/scene/mesh-export.ts` | mm option for STL: **P1** |
| USDZ export | **Partial** (needs `USDZ_CONVERTER_URL`) | convert route L83–95 | Converter service |
| FBX / STEP / BLEND | **Off** (not offered) | — | Real converters only (**P3**) |
| Readiness checks | **Working** (honest `planned`) | `lib/scene/readiness.ts` | Watertight/thickness checks: **P2** |
| Public view link | **Working** (unrevocable) | `/view?src=` | Controlled publish/revoke: **P1** |
| Turntable video | **Working** | `lib/scene/turntable-recorder.ts` | — |
| Voice dictation (browser speech) | **Working** | `lib/use-speech-interpreter.ts` | Language setting: **P0** |
| Native realtime voice (speaking, barge-in) | **P2** | — | Realtime audio model + server session |
| Phone single-photo handoff | **Partial** (built for orbit) | `lib/capture-session.ts`, `phone-companion-orbit.tsx` | Single-photo mode: **P0** |
| Orbit / multi-view reconstruction | **Off** in free-only | `app/capture/page.tsx`; scan worker blocked | **P3** |
| YIIYA daily limit with reset | **Working** | `app/api/interpret/guard.ts` | Distinct UI state: **P0** |
| Personal HF token | **Working** | `components/settings-sheet.tsx`, `lib/settings.ts` | — |

## 9. Copy decisions

| Replace | With |
| --- | --- |
| "get a production-ready model in seconds" | "turns a description or one photo into an editable 3D draft" |
| "GLB, OBJ, USD, STL — ready for any pipeline" | "GLB, OBJ or STL, with an honest readiness check" (USDZ only when configured) |
| "Reconstruct … as a clean, production-ready 3D asset" (internal prompt) | "Make a 3D model of the object in this photo" |
| "a 3D asset made just by saying it" | "Made with YIIYA" |
| "Generating…" + last log line | Phase name + one-line explanation + elapsed |
| "Cancel" (aborts request only) | "Stop" + "work already sent may finish there, but won't replace your work" |
| "Orbit with phone" (free-only) | "Use your phone" (one photo) |
| "[ERROR] …" log lines | Failure card with title, what's unchanged, what still works, next step |

Voice: plain, second person, no exclamation marks, no promises of time or
quality. Technical model names appear only in *Technical details*.

## 10. Assumptions

1. Hugging Face Spaces remain the only 3D generators in the default mode.
2. Gemini (or another LLM) remains available for interpretation; when it isn't,
   the local Director fallback keeps working (existing behaviour).
3. Example numbers (84.2k triangles, 4.2 MB, "7 of 10 left") are illustrative.
4. Inter is proposed as the UI face via `next/font` (self-hosted at build);
   the prototype uses the system UI font when Inter isn't installed.
5. Accounts stay email-link only.
6. The lamp is the only modelled object in the prototype; other starters run
   the same flow with the lamp as a labelled stand-in.
