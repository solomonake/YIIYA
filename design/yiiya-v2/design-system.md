# YIIYA v2 design system

Source of truth: [tokens.json](tokens.json) → generated [tokens.css](tokens.css)
(`node scripts/build-tokens.mjs`). Contrast is validated by
`node scripts/check-contrast.mjs`, which writes [contrast-report.md](contrast-report.md)
and exits non-zero on any failure. Last run: **PASS — 74 token pairs (both
themes) + 16 selection-vs-material checks, 0 failures.**

Method: Design System skill (primitive → semantic → component layers, component
state specs) and UI/UX Pro Max (`--design-system` query matched *Minimalism &
Swiss Style* for professional tools; its suggested scroll-storytelling pattern
and Archivo/Space Grotesk pairing were rejected as unsuited to a workspace).
Accessibility rules applied: contrast 4.5:1 / 3:1, 44 px touch targets,
non-drag alternatives (WCAG 2.5.7), contextual live-region status, reduced
motion, pause 3D rendering when idle/hidden.

## 1. Direction

Three directions were explored on the **same populated studio** (lamp, neck
selected, regeneration card) — see [screens/directions.html](screens/directions.html).

| | 1. Warm workshop | 2. Light drafting desk | 3. Quiet dark studio |
| --- | --- | --- | --- |
| Surfaces | Graphite, warm neutrals | Off-white, 1 px lines, grid canvas | Cool charcoal, near-monochrome |
| Accent | Restrained YIIYA amber for primary/generative | Amber ink for links only | White primary; accent only for selection |
| Readability | High (14.9:1 body on panel) | Highest in daylight (17:1) | High (6.6:1 muted) |
| Object inspection | **Best**: mid-value warm canvas shows brass and dark green; neither washes out | Light canvas flattens light/white materials and glossy highlights | Good, but cool cast shifts warm materials |
| Mobile | Good indoors; light theme covers daylight | Best outdoors | Good indoors |
| Identity | Keeps recognisable YIIYA dark + amber | Loses current identity | Neutral, generic |
| Implementation cost | **Lowest**: current app is dark; Tailwind config already has the amber | Medium: every surface changes | Medium |

**Chosen: Warm workshop**, with a full light theme derived from the drafting
desk (same tokens, light values). It keeps YIIYA's identity, gives the best
neutral backdrop for judging materials, and is the cheapest migration from the
existing dark UI. The light theme covers daylight/outdoor phone use.
Direction 2 and 3 overrides live only in `prototype/directions.css`; they are
spot-checked, not part of the token system.

## 2. Principles

1. **The object is the hero.** Canvas is always the largest region; chrome is quiet.
2. **Say what kind of change it is.** Instant / New version / Exact / Not available
   are distinct in colour, icon, label and behaviour.
3. **Never imply certainty we don't have.** Estimated vs exact, verified vs not
   checked, current vs proposed are always labelled.
4. **Readable first.** 15–16 px conversation, 14 px controls, 12 px minimum.
   Monospace only for measurements and technical values.
5. **Everything by text, keyboard and touch.** Voice and drag are shortcuts.

## 3. Token layers

```
primitive  --yi-amber-500: #EF9F27          raw values, never used by components
semantic   --yi-accent-bg: var(--yi-amber-500)   meaning, swapped per theme
component  --yi-button-primary-bg: var(--yi-accent-bg)
```

Themes: `:root` / `[data-theme="dark"]` (default), `[data-theme="light"]`, and
`prefers-color-scheme: light` when no explicit choice. Reduced motion zeroes all
duration tokens.

### Colour roles (semantic)

| Role | Dark | Light | Use |
| --- | --- | --- | --- |
| `bg-app` / `bg-panel` / `bg-raised` / `bg-sunken` | #171614 / #1F1D1B / #282623 / #100F0E | #F6F4F0 / #FFFFFF / #FBFAF8 / #ECE9E3 | App, panels, cards, inputs |
| `canvas-center` → `canvas-edge` | #423E38 → #22201D | #F1EEE8 → #D2CDC3 | Radial canvas backdrop (mid-value, warm-neutral) |
| `text-primary` / `secondary` / `muted` | #F3F1EC / #C4BFB5 / #A39D92 | #1C1A17 / #46423C / #5E5950 | All ≥ 4.5:1 on panel, raised and sunken |
| `border-control` | #7D776D (3.79:1) | #7D776D (4.44:1) | Input/button boundaries (≥ 3:1) |
| `accent-bg` / `accent-on` | #EF9F27 / #1A1205 (8.53:1) | same | Primary button = "commit/generate" |
| `focus-ring` | #F7C877 (10.8:1) | #8F5A08 (5.8:1) | 2 px outline, 2 px offset |
| `selection` | #4C9AFF | #2366D1 | Selected part outline, rows, chips |
| `action-local` | #56C893 on #15281D | #17653F on #DDF5E8 | Instant edit |
| `action-generative` | #F3B14E on #2B1D08 | #8F5A08 on #FCEBCB | New version (uses GPU) |
| `action-parametric` / `status-future` | #AE96FB on #221B3A | #5E44BD on #ECE6FF | Exact edit; "Proposed · P#" tags |
| `status-success/warning/danger/info/unknown` | tinted pairs, all ≥ 4.5:1 | tinted pairs | Notices, checks |

Status is never colour-only: every state has an icon and a word ("Verified",
"Needs work", "Not checked", "Proposed").

### Selection on the canvas

Selection must stay visible on any material, in both themes:

- **Outline** 3 px in `selection` (≥ 3:1 against canvas centre and edge).
- **Halo** 1 px, luminance-adaptive: white on dark materials, navy `#0B1426` on
  light ones (renderer picks the higher-contrast option).
- Verified against brass, dark green, matte black, chrome, white ceramic,
  terracotta, blue plastic, amber glass: at least one stroke ≥ 3:1 in every case
  (see report). Amber is deliberately **not** the selection colour because brass
  and amber materials would hide it.
- Plus a non-canvas indicator: "Neck selected" pill, composer chip, highlighted
  row in Parts. Focus ring (amber/bronze) is distinct from selection (blue).

## 4. Typography

Two families: **Inter** (UI; load with `next/font/google` so it's self-hosted
at build) and **JetBrains Mono** (measurements, file names, technical tables
only). Fallback: system UI / system mono.

| Token | Size / line | Weight | Use |
| --- | --- | --- | --- |
| `text-display` | clamp(36–56 px) / 1.08 | 600 | Landing headline only |
| `text-3xl` | 40 / 46 | 600 | — |
| `text-2xl` | 28 / 34 | 600 | Page titles, empty canvas title |
| `text-xl` | 22 / 28 | 600 | Section headings, capture titles |
| `text-lg` | 18 / 26 | 600 | Sheet titles, lead copy |
| `text-md` | 16 / 24 | 400 | Conversation, inputs, body |
| `text-sm` | 14 / 20 | 400–500 | Controls, labels, notes |
| `text-xs` | 12 / 16 | 500–600 | Badges, tags, step labels — never body copy |

Rules: nothing under 12 px; no all-caps body; uppercase only for 12 px list
labels with +0.06 em tracking; numbers that are measurements use mono.

## 5. Space, radius, elevation, density

- Spacing: 4 px base — 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64.
- Radius: 6 (small), 10 (controls), 14 (cards, panels), 20 (sheets), full (chips).
- Elevation: panels are flat with 1 px `border-subtle`; floating canvas overlays
  use `canvas-overlay-bg` + border; generation card and sheets add a soft shadow
  (dark theme relies mostly on borders). No glass blur.
- Density: one density. Desktop controls 36–40 px; `pointer: coarse` forces
  44 px minimum for buttons, chips, tabs, segments, rows and swatches.

## 6. Motion

| Token | Value | Use |
| --- | --- | --- |
| `duration-fast` | 120 ms | Hover/press colour |
| `duration-base` | 180 ms | Tab and segment changes |
| `duration-slow` | 260 ms | Panel reveal |
| `duration-sheet` | 280 ms | Bottom-sheet snap |
| `easing-standard` | cubic-bezier(.2,0,0,1) | Default |

No looping decoration. The only continuous motion is the indeterminate spinner
during real waiting (slowed to 3 s/turn with reduced motion). The 3D canvas
renders on demand — no idle auto-rotation. Reduced motion: durations → 0, no
camera easing, no materialise animation.

## 7. Iconography

24 px grid, 1.8 px stroke, round caps (Lucide-compatible shapes; the prototype
inlines its own paths). Icons are decorative (`aria-hidden`) when paired with
text; icon-only buttons always carry `aria-label` and a tooltip. No emoji.

Action icons: instant = lightning, new version = layers, exact = ruler,
not available = ban, proposed = flask.

## 8. Components and states

All interactive components: default, hover, focus-visible, active/pressed,
disabled (with a reason nearby), loading where relevant.

| Component | Variants | States & rules |
| --- | --- | --- |
| **Button** | primary (commit/generate), secondary, ghost, danger, overlay (on canvas); sizes sm 36 / md 40 / lg 48; icon-only | Disabled = 45 % opacity + reason in adjacent text; one primary per region |
| **Composer** | context chips (selection, references) · textarea (auto-grow ≤ 160 px) · photo · mic · send · meta line | Meta line shows action-type preview while typing, voice state otherwise, keyboard hint when empty. Enter sends, Shift+Enter newline. Send disabled when empty with no reference |
| **Mic button** | idle, listening/partial (green, `aria-pressed=true`), thinking, denied, unsupported | Voice states render in the meta line as text with `role=status` (`alert` for denied). Realtime states (speaking, interrupted, reconnecting) tagged P2 |
| **Message** | user bubble (+ "On: Neck", + "Voice · transcribed"), assistant note, system line (neutral/danger) | Suggestions as chips |
| **Action card** | instant, new version, exact (P2), not available, clarify, readiness | Badge + title + body + Target / Changes / Keep (requested) / May change lists + buttons + hint. After a choice, buttons disable and the outcome is written on the card |
| **Generation card** | phases, reconnecting (P1), cancel requested, cancelled, failed (6 kinds), completed | Spinner + phase title + elapsed (mono) + stepper + Stop. Failure: what happened, what is unchanged, what still works, Try again / own token / Technical details / Dismiss. "Never switches to a paid service automatically" always on failures |
| **Canvas overlays** | version chip, view toolbar (undo/redo/rotate/zoom/reset), selection pill, scale pill (estimated/exact), pending-version banner, instant-edit strip, fallback notice | All have keyboard equivalents; toolbar becomes vertical on tablet |
| **Tabs** | inspector (Brief/Part/Versions), side panel (Chat/Brief/Part/Versions) | Arrow keys move; dot marks new selection/version |
| **Part row / swatch / segmented** | default, selected (2 px selection border), disabled (proposed) | `aria-pressed`; swatches 40 px (44 coarse) with labels |
| **Notice / banner** | danger, warning, info, success, unknown, future | Icon + title + body + actions; `role=alert` only for blocking errors |
| **Save pill** | browser, account, saving, offline, conflict (P1), error, expired | Click → "Where your work is saved" sheet |
| **Sheet** | sm 440 / md 560 / lg 760 / xl 980; bottom sheet < 768 px | `role=dialog`, `aria-modal`, labelled; focus moves to title or `[data-autofocus]`; Tab trapped; Esc closes; focus returns to trigger |
| **Check list** | verified, needs work (+ fix), not checked | Word label on every row |
| **Format row** | idle, converting, failed (+ retry, GLB still available), downloaded, unavailable (+ reason) | — |
| **Tags** | Proposed · P1/P2 (violet, flask), Simulated/Example (dashed), New (amber outline) | Prototype/production distinction |

## 9. Layout and responsive rules

| Width | Layout |
| --- | --- |
| ≥ 1280 | Conversation 380 · Canvas · Inspector 340. Empty studio hides the inspector. |
| 768–1279 | Canvas · tabbed side panel 380 (Chat/Brief/Part/Versions) with composer pinned |
| < 768 | Full-bleed canvas + bottom sheet (peek 172 px / half 46 vh / full) with tabs; composer always visible above the safe area; generation card moves to the top of the canvas |
| 320 | Save text hidden (icon remains), compare stacks, meta lists stack |

Keyboard clearance on phones: the composer lives in the sheet, so the on-screen
keyboard pushes the sheet, not the canvas overlays (`env(safe-area-inset-*)`).
200 % zoom: everything is rem/px-token based and wraps; no fixed-height text
containers except the canvas.

## 10. 3D canvas performance guidance (implementation notes)

- Lazy-load the R3F canvas after first paint (already `dynamic(…, { ssr:false })`);
  show the static poster/thumbnail until the GLB decodes.
- Render on demand (`frameloop="demand"`), invalidate on interaction/param
  change; stop entirely on `visibilitychange` hidden.
- Device-aware quality: DPR cap 1.5 on `pointer:coarse`, 2 elsewhere; disable
  shadows/AA below a GPU tier; texture budget 2k on phones.
- Large asset / low memory: if triangles > 500k or `navigator.deviceMemory ≤ 4`,
  load a decimated preview (existing `glb-optimizer`) and offer "Load full 3D".
- WebGL unavailable or context lost: static poster + all non-canvas controls.
