# QA checklist — YIIYA v2 design package

What was actually checked on 2026-10-10, how, and what is still unverified.
"Pass" means observed in the browser or by a script in this session, not
assumed.

Environment: macOS, Claude desktop browser pane (Chromium) with viewport
emulation; headless Google Chrome (SwiftShader WebGL) for captures; Node
v20.20.2; static server `python3 -m http.server 4310`.

## 1. Walkthrough results

| Journey | Path walked | Method | Result |
| --- | --- | --- | --- |
| A. First useful object | Empty studio → starter → preparing/queued/generating/validating/finishing → v1 in 3D → "Make it matte" instant edit → Export | Pointer, 1440×900 | Pass. Phases change with names and elapsed time, no percentage; brief and parts fill in; version chip shows "edited" |
| B. Refinement with selection | Select Neck from Parts → outline + composer chip → type "Make this thinner, but keep the shade exactly the same." → preview says *New version* → regeneration card (target, keep, may change) → Generate → v2 pending banner → Compare (shade drift flagged) → "Undo that. Make it 35 centimetres tall." | Pointer + keyboard, 1440×900 | Pass after fix D3 (see §4). "Undo that" now declines v2 and keeps v1; height becomes ≈35 cm (estimated) |
| B (proposed) | Same request with Capability view = Proposed → exact-edit card → Apply | Deep link `studio-revision-proposed` | Pass (renders, tagged "Proposed · P2") |
| C. Interrupted | Prototype controls: connection drop → current shows "can't be resumed"; proposed shows reconnecting → restored | Deep links + controls | Pass (simulated) |
| D. Quota unavailable | Next result = GPU capacity unavailable → failure card keeps v1, instant edits still apply, Try again, own-token link, no reset time; daily-limit variant shows server reset time | Deep links | Pass (simulated) |
| E. Capture | Desktop upload/QR/received/expired; phone permission → frame → low light → review → uploading → failed → retry → sent; denied → upload fallback; expired/invalid links | Deep links + clicks at 390×844 | Pass (simulated; no camera used) |
| F. Return & export | Projects → Open "Desk lamp" → 10 turns, 3 versions, brief restored → Export (destinations, checks, formats, converting/failed/unavailable) → Share disclosure | Pointer, 1440×900 | Pass |

## 2. Keyboard checks (real key presses in the browser pane)

| Check | Result |
| --- | --- |
| `/` focuses the message box from the page | Pass |
| Typing shows the action-type preview ("Instant edit · no generation") | Pass |
| Enter sends; focus stays in the message box; status region announces "Instant edit applied: finish → matte" | Pass |
| Parts list: Enter selects a part, inspector switches to Part, focus lands on the same part in the Part panel | Pass after fix D5 |
| `Esc` clears the selection | Pass |
| Ctrl+Z undoes the instant edit (finish back to glossy; redo stack 1) | Pass |
| Canvas focusable; ArrowRight rotates | Pass (state verified; visual change seen in earlier captures) |
| Export via keyboard: focus moves to the dialog title | Pass |
| Shift+Tab / Tab stay inside the dialog | Pass after fix D6 (was escaping to page) |
| Esc closes the dialog and returns focus to the Export button | Pass |
| Tabs move with arrow keys | Implemented; spot-checked only |

## 3. Automated scans (all 101 scenarios)

| Scan | Width | Result |
| --- | --- | --- |
| Text below 12 px | 1440 | Pass after fix D7 (one 10.8 px mono elapsed time in failure notes) |
| Text contrast < 4.5:1 on solid backgrounds | 1440 | 0 found. Limitation: text over the gradient canvas was skipped (all canvas overlays have solid token backgrounds) |
| Interactive elements without an accessible name | 1440 | 0 found |
| Targets smaller than 32 px (desktop) | 1440 | "Clear selection"/"Remove reference" 28 px → fixed to 32 px (44 px on touch) — D8 |
| Horizontal overflow | 320 | 20 scenarios overflowed (page headers up to 370 px) → fixed (D9, D16). Re-scan: 0 of 101 overflow |
| Token contrast pairs (both themes) + selection vs 8 materials | — | PASS: 74 pairs + 16 material checks (`scripts/check-contrast.mjs`) |

Re-scan at 320 after D9: see §6.

## 4. Visual and behavioural defects found and fixed

| # | Defect | Where found | Fix |
| --- | --- | --- | --- |
| D1 | Prototype button overlapped the composer hint | 1440 screenshot | Moved to bottom-right (top-right on phones) |
| D2 | Empty studio showed a full brief panel (contradicts "no overwhelming panels") | 1440 screenshot | Inspector hidden until there's an object or conversation |
| D3 | "Undo that" after a revision undid the earlier matte edit instead of declining the new version | Journey B walk | Pending version is declined first; first version is not undoable |
| D4 | Undo restored an old versions list and dropped v2 → console error | Console | Versions are append-only under undo; banner guarded |
| D5 | Selecting from the Brief parts list lost keyboard focus | Keyboard check | Focus moves to the same part in the Part panel |
| D6 | Dialog focus escaped with Shift+Tab from the title | Keyboard check | Background `inert` while a sheet is open + stricter trap |
| D7 | Mono text inherited 0.9 em → 10.8 px inside 12 px notes | Scan | `font-size: max(12px, 0.9em)` |
| D8 | 28 px clear/remove buttons | Scan | 32 px desktop, 44 px coarse pointer |
| D9 | Page headers overflowed at 320 px | Scan | Icon-only header buttons below 400 px (labels kept for assistive tech) |
| D10 | "3D view unavailable" notice stayed after the 3D module loaded | Headless capture | Re-render after late mount; notice only when WebGL is really unavailable |
| D11 | Tablet: view toolbar collided with the version chip; save pill wrapped | 768 capture | Vertical toolbar; icon-only save status on tablet |
| D12 | Bottom-left hint overlapped the instant-edit strip | 1440 screenshot | Hint row raised above the strip |
| D13 | Long placeholders truncated in a one-line composer | Screenshots | Shorter placeholders |
| D14 | Phone captures were laid out wider than 390 px (headless min window width) | Capture review | Exact-size iframe wrapper + centred crop |
| D15 | Chat didn't scroll to the newest card | Journey B | Scroll to bottom after each render |
| D16 | Prototype-only "Low light demo" / "Simulate" buttons sat in product rows and overflowed at 320 px | 320 scan | Moved into a dashed, labelled "Prototype" strip, hidden in gallery frames |
| D17 | After D9, landing header buttons without icons would render empty below 400 px | Review | Added icons (labels stay accessible) |
| D19 | Founder test: "Put it on a desk" made a near-identical v2 (only shade drift) — looked like nothing happened | User report | Placement/scene requests now answered as "not available" with a next step; Compare shows "You asked: …" and says YIIYA can't confirm it automatically; prototype labels unsimulated requests and stand-in models; pull-chain now drawn; Prototype button hidden while a dialog is open |
| D18 | Phone composer placeholder wrapped; keyboard-shortcut hint shown on touch | 390 capture review | Shorter placeholder; "Type, or tap the mic to talk." on phones |

## 5. Mobile and responsive checks

| Check | Result |
| --- | --- |
| 390×844: composer visible on first load (current product shows none) | Pass (`studio-empty--p`) |
| 390: canvas + bottom sheet with Chat/Brief/Part/Versions; selection chip in composer; generation card at top of canvas | Pass (captures) |
| 390: sheets become bottom sheets | Pass (captures) |
| 768×1024: canvas + tabbed side panel with pinned composer | Pass after D11 |
| 320×640: no horizontal scroll | Pass for all 101 scenarios after D9/D16 (§6) |
| Safe areas | `env(safe-area-inset-bottom)` applied to composer and sheet footers; not verified on a notched device |
| 200 % zoom | **Not run.** 320 px scan used as a reflow proxy (≈ 640 px at 200 %) |
| Touch targets | 44 px via `pointer: coarse` rules; not verified on a touch device |

## 6. Final re-scan (320 px)

After D9 and D16: all 101 scenarios report `scrollWidth = 320` (no horizontal
scroll) in the browser pane at 320×640. Text-size scan at 320: 0 nodes below
12 px.

## 7. Known gaps (not verified)

- No screen reader session (VoiceOver/NVDA); announcements were checked only
  by reading the live region text.
- No real camera, microphone, phone, or notch/keyboard-overlap test.
- Light theme captured only for the direction comparison; light contrast is
  validated at token level.
- Directions 2 and 3 are spot-checked, not fully validated.
- No performance measurement of the real app; targets in product-spec §3 are
  proposals.
- The current product's generation, settings, sign-in and asset tray were
  reviewed in source only (live calls would have used real credentials).

## 8. Repeatable acceptance scenarios (for the real implementation)

1. **Ten-turn lamp.** New browser profile → studio → send the lamp prompt →
   v1 → "Make the shade matte" (instant) → select neck → "Make this thinner,
   but keep the shade exactly the same." → confirm → compare → "Undo that.
   Make it 35 centimetres tall." → select base → "Make this black" → "Make the
   neck glossier" (unsupported per part) → "Can it be 3D printed?" → "Add a
   small pull-chain switch" → keep v3 → "Export it for my portfolio render".
   Reload → everything restored. Export GLB → opens in Blender.
2. **Failure never replaces work.** Mock pipeline to return each failure kind;
   current version, edits and messages are unchanged; failure card names what
   still works; no version is created.
3. **No paid fallback.** With commercial keys present and `YIIYA_3D_MODE` unset,
   assert only HF providers are attempted (existing tests) and the UI says so on
   failure.
4. **Keyboard only.** Complete scenario 1 without a pointer.
5. **Phone.** On a 390 px device, complete scenario 1 steps 1–5 with touch and
   the on-screen keyboard; composer never hidden by the keyboard.
6. **Honest export.** After instant edits, Export shows the "not in downloads"
   notice (until P1 baking ships); STL row states metres; USDZ disabled with a
   reason when no converter.
7. **Share disclosure.** Link creation impossible without ticking the public
   acknowledgement.
8. **Capture.** Deny camera → upload fallback works; expired pairing link →
   clear recovery; free-only never shows orbit.
