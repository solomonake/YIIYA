# Current-state audit — YIIYA studio (2026-10-10)

Scope: the live product surfaces on `main` plus the uncommitted free-only change
set in this working tree. Every finding is labelled **Observed** (seen in the
running app on `localhost:3000`, measured in the browser, or reproduced) or
**Source** (read from code, not exercised). Nothing here was verified against a
deployed environment, live Hugging Face capacity, a real phone camera, or a
real generation.

## What was actually viewed

| Screen | How | Evidence |
| --- | --- | --- |
| Landing `/` at 1440×900 | Opened in the browser pane | [screens/current/01-landing-1440.jpg](screens/current/01-landing-1440.jpg) |
| Studio `/app` empty at 1440×900 | Opened; text sizes and contrast measured with a DOM script | [screens/current/02-studio-empty-1440.jpg](screens/current/02-studio-empty-1440.jpg) |
| Studio `/app` empty at 390×844 | Opened | [screens/current/03-studio-empty-390.jpg](screens/current/03-studio-empty-390.jpg) |
| Capture `/capture` at 390×844 | Opened; the pane blocks camera, so this is the denied state | [screens/current/04-capture-denied-390.jpg](screens/current/04-capture-denied-390.jpg) |
| Library `/library` | Opened; local env has no auth configured | text only: "Auth isn't configured on this deployment yet." |
| Viewer `/view` with no `src` | Opened | text only: "No model to show — this link is missing…" |

**Not exercised:** a generation. Real `GEMINI_API_KEY` and `HUGGINGFACE_TOKEN`
values are configured in `.env.local`, so submitting a prompt would have made
live provider calls; the brief forbids that. Generation, clarify, edit-confirm,
asset tray, settings and sign-in states below are **Source** findings.

## Measured readability (Observed)

DOM scan of the empty studio at 1440×900:

- All 16 visible text nodes are **8–10 px** (8 px ×8, 9 px ×6, 10 px ×2).
- 15 of 16 are below **4.5:1** contrast. Lowest: **1.36:1** (`text-zinc-800` on
  `#060606`) for "Drop or click — photo → 3D" and the cost-transparency footer.
  The system log lines measure **1.94:1**.
- Toolbar controls are **22 px tall** (LOG, ASSETS, CAPTURE, ⚙); the mic and
  send buttons are 32 × 32 and 24 × 32 px. Target is 44 px on touch.
- `body` asks for "JetBrains Mono" but no web font is loaded
  (`document.fonts` is empty) — it falls back to the OS monospace.
- Across `app/` and `components/`, `text-[8px]`–`text-[11px]` appear 144 times;
  only 4 uses are ≥ 12 px.

## Findings

| # | Area | Finding | Kind | Evidence | User impact | Recommendation |
| --- | --- | --- | --- | --- | --- | --- |
| A1 | Mobile studio | On a 390 px phone the studio opens to a black canvas with four 8 px buttons. There is **no prompt box**; the conversation panel is hidden on load and becomes a full-screen overlay when opened. | Observed | [03-studio-empty-390.jpg](screens/current/03-studio-empty-390.jpg); `components/yiiya-workspace.tsx` L889–898, L341 | A first-time phone user can't see how to start. | **Change**: canvas + bottom sheet with the composer always visible. |
| A2 | First use | Starter prompts render only when `logs.length === 0`, but three `[SYSTEM]` boot logs are added on first visit, so the starters never appear. | Observed + Source | `yiiya-workspace.tsx` L386–392 vs L975–981; desktop screenshot shows no starters | The best onboarding affordance is invisible. | **Change**: starters in the empty canvas, independent of logs. **Remove** boot log lines. |
| A3 | Conversation | The primary conversation is a terminal-style log (`[DIRECTOR]`, `[GENERATOR]`, `[QA]`) in 9 px monospace, colour-coded only by hue. | Observed + Source | `yiiya-workspace.tsx` L384–406 | Hard to read; technical noise dominates; colour-only meaning. | **Change**: user/assistant turns with typed action cards; move provider logs to an optional details sheet. |
| A4 | Readability | 8–10 px text, < 4.5:1 contrast, 22 px controls (see measurements). | Observed | DOM scan above | Fails WCAG 1.4.3 and 2.5.8; tiring for everyone. | **Change**: 14–16 px UI text, tokenised contrast (validated), 36–44 px controls. |
| A5 | Free-only capture | The laptop shows **"Orbit with phone"** and the phone runs a 6-second guided orbit, but in free-only mode only the first photo is used; the button caption admits this. | Source | `yiiya-workspace.tsx` L619–627; `app/capture/page.tsx` L18, L403; `lib/interpret-pipeline.ts` L1342–1344 | Users do extra work for no benefit. | **Change**: single-photo capture; "Use your phone" sends one photo; explain why only one. **Remove** orbit in free-only mode. |
| A6 | Camera denied | Phone capture shows only "Camera access was denied. Allow camera access and reload." with no upload fallback or retry. | Observed | [04-capture-denied-390.jpg](screens/current/04-capture-denied-390.jpg); `app/capture/page.tsx` L115 | Dead end. | **Change**: upload-a-photo fallback + retry + settings guidance. |
| A7 | Instant edits vs exports | Colour/finish/scale edits and region colours are applied only in the viewer (`materialOverride`, vertex tints). Download links are built from the original `glbUrl`, so **downloads do not contain those edits**. Region tints are not stored at all and disappear on reload or asset switch. | Source | `components/scene-canvas.tsx` L647–671, L705–735; `lib/store.ts` L311–324; `lib/scene/export-urls.ts` L10–22 | User exports a file that doesn't match what they saw. | **Change** now: disclose in Export. **P1**: bake edits on export and persist region edits. |
| A8 | Undo | Cmd/Ctrl+Z steps between assets in the tray; it does not undo instant edits. | Source | `yiiya-workspace.tsx` L771–779, L958–973 | "Undo" after "make it matte" switches to a different asset. | **Change**: undo stack covering instant edits and version switches; label it as not a CAD history. |
| A9 | Memory | Client sends the last 4 messages; the Director reads the last 3. Store keeps 10. | Source | `lib/use-speech-interpreter.ts` L191; `lib/interpret-pipeline.ts` L296; `lib/store.ts` L340 | "Keep the shade" is forgotten two turns later. | **P1**: structured brief (preserve list, size, destination) sent with every request. |
| A10 | Structural edits | Anything not colour/finish/scale regenerates the whole object after a confirm card. Part targeting supports colour only, via a radius-based region around the click. | Source | `lib/scene/local-edit.ts` L96–99, L169–229; `lib/scene/region-select.ts` L1–40; `lib/use-speech-interpreter.ts` L95–111 | "Thinner neck, keep the shade" may change the shade. | **Keep** the confirm gate. **Change**: show target, keep-list and "may change" before generating, and compare before replacing. **P2**: parametric/part-aware edits. |
| A11 | Selection access | Selection is mouse-click only on the canvas; no keyboard, list or touch-friendly alternative; no visible "what is selected" outside a highlight. | Source | `components/scene-canvas.tsx` L705–716, L799 | Keyboard and screen-reader users can't select parts. | **Change**: parts list (P2 named parts) + "pick region at crosshair" (achievable now) + a visible selection chip. |
| A12 | Generation progress | Pipeline events carry invented `progress` numbers (0.01, 0.05, 0.1 + 0.6·i/n). The UI shows the last log line, not a percentage. | Source | `lib/interpret-pipeline.ts` L1520, L1535, L1604; `yiiya-workspace.tsx` L752–767 | Risk that a future UI shows fake percentages. | **Keep** "no percentage". **Change**: named phases + indeterminate wait + elapsed time. |
| A13 | Interrupted generation | Generation is one streamed request with a 35 s client watchdog and a 270 s server deadline; Cancel aborts only the browser request. A dropped connection loses the job. | Source | `lib/use-speech-interpreter.ts` L150–160, L392–399; `lib/interpret-pipeline.ts` L1352–1354 | Long waits are fragile; cancel copy over-promises. | **Change** now: "Stop waiting" copy and "can't resume" state. **P1**: durable jobs. |
| A14 | Failed output | A failed generation still adds a `fallback` tile to the tray (with "no exports — generation failed"). | Source | `yiiya-workspace.tsx` L170–172; `lib/interpret-pipeline.ts` L1627–1628 | Failures look like assets. | **Change**: failures are messages and a failure card, never versions. |
| A15 | Quota | Two different limits exist: YIIYA's daily generation limit (with reset time from the server) and Hugging Face capacity (no reset time). The UI shows "N/M gens left today" in 8 px. | Source | `app/api/interpret/guard.ts` L104–127; `yiiya-workspace.tsx` L553–560 | Users can't tell which limit hit them or what still works. | **Change**: distinct failure states; instant edits continue; optional personal HF token. |
| A16 | Marketing copy | Landing says "production-ready model in seconds" and lists "GLB, OBJ, USD, STL — ready for any pipeline". USDZ returns 501 unless a converter is configured; "seconds" isn't measured; readiness isn't verified. The photo prompt asks for a "production-ready" asset. Viewer metadata says "made just by saying it". | Observed + Source | `app/page.tsx` L18, L252; `app/api/3d/convert/route.ts` L83–95; `lib/use-speech-interpreter.ts` L389; `app/view/page.tsx` L22 | Over-promising erodes trust on first failure. | **Change** copy (see product-spec §Copy). |
| A17 | Landing visual | A permanently spinning WebGL icosahedron with `cursor-grab` but no interaction; no reduced-motion handling; no real example. | Observed + Source | `app/page.tsx` L298 and HeroCanvas | Decorative motion; misleading affordance. | **Replace** with a labelled example render and honest limits. |
| A18 | Sharing | "share / AR" copies `/view?src=<GLB URL>` — a public, unrevocable link that embeds the file address, with no disclosure. | Source | `yiiya-workspace.tsx` L108–124 | Users may share more than they think. | **Change** now: disclose before creating. **P1**: controlled publish. |
| A19 | Library | Lists account assets only; no search, rename, duplicate or delete; anonymous users see nothing. | Observed + Source | `app/library/page.tsx` L118–200 | Return journey is weak. | **Change**: projects (not assets) with browser/account badges. |
| A20 | STL units | GLB→STL conversion bakes transforms with no unit conversion; glTF is metres, slicers usually assume millimetres. | Source (inferred — no unit code found) | `lib/scene/mesh-export.ts` | A 35 cm lamp may import as 0.35 mm. | **Change**: state units at export; P1 option to export in mm. |
| A21 | Settings | Token copy is accurate (stored in browser, sent with requests, HF billing applies) but at 9 px; no appearance, motion or capability status. | Source | `components/settings-sheet.tsx` | Good content, hard to read. | **Keep** copy; **change** presentation; add sections. |
| A22 | Clarify & edit-cost gates | The ambiguity gate and regenerate confirmation are sound product decisions. | Source | `yiiya-workspace.tsx` L408–495 | Prevents wasted generations. | **Keep**, restyle as action cards. |

## Keep / change / remove summary

**Keep:** free-only routing; clarify gate; regenerate confirmation; instant edit
classifier; no-percentage progress; honest readiness checks (`planned` rather
than fake `ready`); real OBJ/STL conversion; GLB proxy/mirroring; BYO HF token
copy; failed-asset export suppression.

**Change:** reading sizes and contrast; conversation model; mobile layout;
capture (single photo); selection access; undo; generation status; export
disclosures; sharing disclosure; library → projects; marketing copy.

**Remove:** boot log lines; orbit flows in free-only mode; spinning hero
icosahedron; "production-ready" and "USD … ready for any pipeline" claims;
failed placeholders in the asset list.

## Comparison mockups

| Current | Proposed (same state) |
| --- | --- |
| [Studio empty, 1440](screens/current/02-studio-empty-1440.jpg) | [studio-empty--d](screens/png/studio-empty--d.png) |
| [Studio empty, 390](screens/current/03-studio-empty-390.jpg) | [studio-empty--p](screens/png/studio-empty--p.png) |
| [Capture, camera denied, 390](screens/current/04-capture-denied-390.jpg) | [phone-capture-denied--p](screens/png/phone-capture-denied--p.png) |
| [Landing, 1440](screens/current/01-landing-1440.jpg) | [landing--d](screens/png/landing--d.png) |

Current screenshots are browser-pane captures (reduced resolution JPEG). Proposed
PNGs are exact-size headless-Chrome captures of the prototype.
