# YIIYA v2 — product design package

Design package produced from [`docs/CLAUDE_PRODUCT_DESIGN_PROMPT.md`](../../docs/CLAUDE_PRODUCT_DESIGN_PROMPT.md)
on 2026-10-10. It's a design proposal: **no production code, API, credential or
deployment was changed**, and no model or provider was called. All content in
the prototype is example data with simulated outcomes.

**Chosen direction:** *Warm workshop* — graphite canvas, warm neutral chrome,
restrained YIIYA amber — with a full light theme. Rationale in
[design-system.md §1](design-system.md#1-direction).

## Open it

```bash
python3 -m http.server 4310 --bind 127.0.0.1 --directory design/yiiya-v2
```

Then visit:

| What | URL |
| --- | --- |
| Clickable prototype | http://127.0.0.1:4310/prototype/index.html#/ |
| Studio, empty | http://127.0.0.1:4310/prototype/index.html#/studio |
| Restored 10-turn project | http://127.0.0.1:4310/prototype/index.html#/studio?scenario=studio-restored |
| Screen & state gallery | http://127.0.0.1:4310/screens/index.html |
| Three directions | http://127.0.0.1:4310/screens/directions.html |

In Claude Code's desktop app the same server is registered as the
`yiiya-design-v2` preview in `.claude/launch.json`.

The 3D canvas is an ES module and needs the server. Opened via `file://`, the
prototype still works with a static SVG view (the "3D unavailable" path).

**Prototype controls:** the dashed *Prototype* button (bottom-right; top-right
on phones) switches *Capability view* (Current ↔ Proposed P1/P2), theme,
direction, the result of the next generation (success, GPU capacity
unavailable, daily limit, not configured, not responding, invalid mesh),
connection drop, offline, WebGL, low memory, account and save conditions, and
microphone permission. It's hidden in gallery frames (`&frame=1`) and isn't
part of the product UI.

Any state can be deep-linked: `prototype/index.html#/<route>?scenario=<id>`
(add `&theme=light`, `&cap=proposed`, `&direction=drafting|quiet`).

## Artifact index

| # | Artifact | Path |
| --- | --- | --- |
| 1 | This index, coverage, verification | `README.md` |
| 2 | Current-state audit (evidence, observed vs inferred, keep/change/remove, comparisons) | [current-state-audit.md](current-state-audit.md), [screens/current/](screens/current/) |
| 3 | Product spec: jobs, scope, success criteria, IA, navigation, journeys A–F, capability ledger, copy | [product-spec.md](product-spec.md) |
| 4 | Design system + tokens (primitive → semantic → component, light/dark) + validated contrast | [design-system.md](design-system.md), [tokens.json](tokens.json), [tokens.css](tokens.css), [contrast-report.md](contrast-report.md) |
| 5 | Editable mockups: every screen/state as live HTML + exact-size PNG captures, browsable gallery | [screens/index.html](screens/index.html), [screens/png/](screens/png/), [screens/manifest.json](screens/manifest.json), [screens/directions.html](screens/directions.html) |
| 6 | Clickable prototype | [prototype/](prototype/) |
| 7 | Implementation handoff: components, repo mapping, state/event contracts, backend dependencies with acceptance criteria, migration, task order | [implementation-handoff.md](implementation-handoff.md) |
| 8 | QA checklist: walkthrough results, keyboard/mobile checks, defects fixed, gaps, acceptance scenarios | [qa-checklist.md](qa-checklist.md) |

Scripts (Node ≥ 20, no dependencies):

```bash
node design/yiiya-v2/scripts/build-tokens.mjs     # tokens.json -> tokens.css
node design/yiiya-v2/scripts/check-contrast.mjs   # writes contrast-report.md, exit 1 on failure
node design/yiiya-v2/scripts/capture-screens.mjs  # needs the server + Google Chrome; writes screens/png
```

Prototype source map: `core.js` (state, routing, icons, focus, announcements) ·
`engine.js` (simulated assistant routing, generation phases, edits, undo,
versions) · `studio.js` · `pages.js` · `sheets.js` · `scenarios.js` (deep-link
fixtures) · `fixtures.js` (example content) · `lamp-svg.js` / `lamp3d.js`
(example lamp; three.js r171 vendored from `node_modules`, MIT) · `app.css` ·
`directions.css` (exploration only).

## Coverage checklist

Surfaces from the brief's inventory → scenarios in the gallery.

| Surface | Covered states | Breakpoints captured |
| --- | --- | --- |
| Landing | honest example, text/photo entry, limits, no testimonials | 1440, 390 |
| First use | starters, 3 steps, mic optional, no account | 1440, 768, 390 |
| Projects/library | populated, signed-out, empty, loading, error, search-empty, rename, delete confirm; failed project placeholder; proposed actions tagged | 1440 (+390 for key states) |
| New project | prompt, reference, destination, optional size (progressive) | 1440, 390 |
| Studio empty | large canvas, starters, discoverable input | 1440, 768, 390 |
| Studio conversation | turns, clarify, action cards, suggestions, typing preview, unsupported, references | 1440, 390 |
| Studio editing | selected part, colour, finish (unsupported/proposed), shape (P2), keep, whole-object size, undo, compare | 1440, 768, 390 |
| Generation | preparing, queued, generating, validating, draft (P1), finishing, completed, cancel requested, cancelled, 6 failure kinds, interrupted, reconnecting/restored (P1) | 1440 (+390 key) |
| Voice | idle, listening, partial, thinking, speaking/interruption/reconnect (P2), denied, unsupported | 1440 (+390 key) |
| Asset/revisions | versions, pending version, compare, restore/keep, history, failed never a version | 1440, 390 |
| Capture | desktop upload, QR, received, expired; phone permission, framing, low light, denied, review, uploading, failed, sent, expired, invalid; single-image explanation | 1440 / 390 |
| Readiness/export | destinations, verified/needs work/not checked, formats, units, converting, failed, unavailable, proposed baked edits | 1440 (+390) |
| Shared viewer | ready (orbit/zoom buttons), loading, unavailable, no-WebGL; public-link disclosure; proposed controlled publish | 1440, 390 |
| Account | sign in, invalid email, sent, verifying, expired link, success, expired session, conflict (P1), save status | 1440 (+390) |
| Settings | appearance (new), voice/input, generation + HF token, privacy/clear, capability status | 1440, 390 |
| Help/recovery | tips, shortcuts, troubleshooting, safe diagnostics, feedback (never auto-sent), technical details | 1440, 390 |
| Global | offline, WebGL unavailable, low memory, phone bottom sheet, phone menu | 1440, 390 |

Tablet (768) captures exist for the studio workspace states (empty, v1,
selected, restored) and projects; every scenario also renders at any width
live.

## Verification performed

See [qa-checklist.md](qa-checklist.md) for details and results. In short:

- Current product viewed locally at 1440 and 390 (landing, studio, capture,
  library, viewer); readability measured with a DOM script.
- Prototype opened in the browser pane at 1440×900, 768×1024, 390×844 and
  320×640; journeys A and B walked by pointer and by keyboard; focus trap and
  focus return verified with real key presses.
- Automated scans over all 101 scenarios at 1440 and 320 (text size, contrast
  on solid backgrounds, accessible names, target size, horizontal overflow).
- Contrast tokens validated by script (PASS).
- Every scenario captured with headless Chrome at its listed breakpoints.

## Limitations (honest)

- No Figma file was produced; the editable mockups are HTML/CSS/JS.
- No real phone, camera, microphone, screen reader or 200 % browser zoom
  session was run. 320 px was used as the narrow-layout proxy for zoom reflow.
- Voice and generation are simulated; nothing proves live HF timing, quality
  or availability.
- The lamp is a hand-built example (three.js primitives / SVG), not YIIYA output.
- Inter isn't bundled; the prototype falls back to the system UI font.
- Light/drafting/quiet direction captures exist only for the comparison state.
