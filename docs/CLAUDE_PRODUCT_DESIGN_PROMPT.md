# Claude prompt: design the complete YIIYA product

Copy everything below the divider into Claude Code with this repository open.
For Claude without repository access, attach this file, `YIIYA.md`, the product
strategy documents, and screenshots of the current screens. Do not provide
environment files, tokens, or private user projects.

---

Act as YIIYA's senior product designer, interaction designer, and design engineer.
Produce a complete, coherent product design package with screen mockups, a
clickable prototype, a design system, and an implementation handoff. Make the
actual artifacts; a written recommendation or a landing page alone is not enough.

## Product and objective

YIIYA is a conversational AI CAD and 3D creation studio. People describe, show,
or photograph an object, inspect a draft, refine it through conversation and
direct selection, and export a usable asset. It is not a website generator.

The founder's complaint: the current experience is buggy, slow, and does not
reliably create what users describe. They want natural conversation, responsive
editing, good models, and a product people can actually use. They stopped paying
for Meshy. The immediate direction is Hugging Face-only 3D generation with no
automatic commercial-provider fallback. Do not design around a Meshy subscription.

Prioritize students, makers, and independent creators working on desk objects,
props, and simple product concepts. The initial success case is ONE object
created, refined across ten conversational turns, restored after reopening,
and exported. Advanced characters, animation, manufacturing, and reconstruction
need honest capability boundaries rather than dominating onboarding.

## Work rules and relevant skills

1. Read `AGENTS.md`, `.agent/AGENT_OS.md`, `.agent/playbook.md`,
   `.agent/decisions.md`, `.agent/handoffs/current.md`, and inspect git status.
2. Use the available Design, UI/UX Pro Max, and Design System skills. Discover
   their actual `SKILL.md` locations; do not assume an unavailable plugin exists.
   Use accessibility and interaction guidance, primitive → semantic → component
   tokens, and component state specifications. Apply only relevant guidance.
3. Audit the implementation and inspect current screens locally if tools permit.
   State which screens you actually viewed versus inferred from source.
4. Preserve existing user changes, especially untracked `.claude/skills/`.
   Work in a separate `design/yiiya-v2/` directory for the prototype. Do not
   rewrite production pages while producing this design package.
5. Complete the work using reasonable assumptions. Record assumptions rather
   than asking a long questionnaire. Do not pause between routine deliverables.
6. No deployment, merge, credential changes, paid generation, or external
   communications. Use local/synthetic assets for prototypes; label them as
   examples. No actual provider calls are necessary to demonstrate interactions.
7. If a tool cannot create Figma files or capture screenshots, deliver editable
   HTML/CSS/React and identify the missing output honestly. Do not claim that
   images were exported or interactions tested unless they were.

## Ground the redesign in this repository

Read these focused entry points before proposing architecture or UI:

- `YIIYA.md`, `docs/PRODUCT_STRATEGY_3D_CAD.md`,
  `docs/PRODUCT_STRATEGY_2026-07.md`, `docs/TRANSFORMATION_PLAN.md`.
- `app/page.tsx`: landing page.
- `app/app/page.tsx`, `components/yiiya-workspace.tsx`: main studio, side panels,
  prompt/voice input, asset tray, inspection, exports, and generation feedback.
- `lib/use-speech-interpreter.ts`: browser dictation, local edit routing,
  regeneration confirmation, and streamed generation.
- `lib/interpret-pipeline.ts`, `lib/generation-policy.ts`: real generation path.
- `lib/store.ts`, `lib/scene/local-edit.ts`, `lib/scene/region-edit-bridge.ts`:
  session state and current local editing limitations.
- `app/library/page.tsx`, `components/auth/`, `components/settings-sheet.tsx`:
  library, account entry, and settings.
- `app/capture/page.tsx`, `components/phone-companion-orbit.tsx`,
  `app/scan/[sessionId]/page.tsx`: photo/orbit/phone companion and scan flows.
- `app/view/page.tsx`: viewer/share surface.
- `lib/scene/readiness.ts`, `lib/scene/export-urls.ts`,
  `app/api/3d/convert/route.ts`: readiness and real export availability.
- `app/globals.css`, `tailwind.config.*`, `package.json`: existing styles and
  stack (Next.js 14, React 18, TypeScript, Tailwind 3, Zustand, Three.js/R3F).

Old documentation contains historical claims. Verify against current code.
Do not infer production readiness from configured credentials or passing tests.

Initial audit findings to verify:

- The current interface uses dark surfaces, amber accents, abundant monospace,
  and many 8–11px labels. Improve reading comfort and control sizes.
- Voice currently transcribes commands; it is not a native realtime voice agent.
- The client retains limited conversation history and the Director only sees
  three recent messages. Long-term design memory is a proposed capability.
- Local color/finish/scale and some selected-region coloring already exist.
  General structural edits regenerate; they do not preserve arbitrary parts.
- Main studio generation is request-bound SSE, with a long sequential cascade.
  Durable reconnectable studio jobs are proposed, not already implemented.
- Undo/redo currently steps through asset history. Do not imply a full CAD
  operation history exists.
- Current exports include GLB and conversion to OBJ/STL. USDZ requires configured
  conversion infrastructure. Check actual paths; do not advertise unsupported
  FBX/STEP/BLEND output or “manufacturing ready” from file existence alone.
- Watertightness, likeness, editable part separation, dimensions, and semantic
  fidelity are not automatically guaranteed by a technically valid mesh.
- Some marketing copy overstates format support. Identify such discrepancies.

## Non-negotiable model/cost truth

- `YIIYA_3D_MODE=free-only` is the default. It restricts the active 3D cascade to
  HF Spaces, regardless of old paid credentials, face routing, or provider order.
- Missing HF setup, exhausted quota, sleeping/broken Spaces, and queues must
  have specific, recoverable user states. No automatic paid-provider fallback.
- HF-hosted open models do not mean unlimited, guaranteed free GPU availability.
  Account quota/billing settings still apply. Do not promise fixed generation
  times or zero total operating cost. Reasoning, image generation, storage, and
  export infrastructure have separate costs and availability.
- In the current free-only studio route, orbit inputs use only the first image.
  Full external scan reconstruction is disabled in this mode. Do not tell users
  to orbit to gain verified multi-view geometry that this route cannot deliver.
- Expose useful status without making novices choose between model names.
  Put technical provider details in an optional details panel.
- Never show simulated generation progress as a measured percentage. Use real
  phase names and indeterminate waiting when upstream progress is unknown.
- Do not encourage quota bypass, token sharing, or multiple accounts to evade
  limits. Never place secrets in screenshots, URLs, analytics, or mock data.

## Desired interaction model

Design a canvas-first studio: the object is central, conversation stays close,
and advanced controls appear when relevant. Help beginners without obstructing
experienced users. Text must support everything voice can do.

Use a persistent structured design brief in the proposed experience: object,
parts, dimensions and units, materials, style, intended destination, references,
requirements to preserve, open questions, and version history. The user should
not have to repeat “keep the shade” after every turn.

Separate action types visibly and behaviorally:

1. Local edit: immediate preview, reversible, no new 3D generation.
2. Generative revision: explain which parts may change, retain the original,
   and show a comparison before replacing it.
3. Parametric edit: exact supported dimensions/constraints, validated by code.
4. Unsupported action: concise explanation and a workable next step.

The planner can select tools, but a language model is not itself a CAD kernel.
Distinguish appearance meshes from dimensioned parametric geometry. Mark future
tools in design annotations, and show appropriate unavailable states in the
current-capability prototype.

## Core journeys to prototype

### A. First useful object

Landing → start with text or photo → clarify only consequential ambiguity →
editable draft → local finish/color change → readiness → export.
Do not require an account before seeing the workspace; explain when persistence
requires sign-in and distinguish browser-only from account-saved work.

### B. Natural refinement with selection

User: “Make a compact desk lamp with a curved brass neck and a dark green shade.”
Assistant confirms the meaningful interpretation briefly; a draft appears.
User selects the neck: “Make this thinner, but keep the shade exactly the same.”
Show the intended target, changed constraints, and preserved parts.
For unsupported semantic geometry edits, show the honest current limitation;
also show the clearly labelled future parametric interaction.
User: “Undo that. Make it 35 centimetres tall.”
Show operation history and distinguish exact geometry from estimated mesh scale.

### C. Interrupted generation

Start generation → shared GPU queue → connection drops → reconnect → restore
the job state → result or actionable failure. The durable-job version is a
proposed backend dependency; prototype it with labelled fixtures.
Include an honest current-state alternative when a job cannot be resumed.

### D. Free quota unavailable

No surprise upgrade checkout. Explain free capacity is unavailable, keep the
current object, allow local editing, and offer retry only when meaningful.
Only show a reset time if supplied by the provider. Offer optional personal HF
credentials in advanced settings with accurate storage/transmission copy.

### E. Capture and device handoff

Desktop reference upload; phone single-photo capture; QR companion pairing;
camera permission denied; poor lighting; invalid/expired session; upload retry;
successful transfer. Free-only mode must clearly explain single-image use and
not lead users through an unnecessary orbit for a falsely promised benefit.

### F. Return and export

Open a saved project → restore conversation, selected asset, and revisions →
compare variants → choose destination → see verified/unknown checks → export.
Cover file unavailable, conversion failed, storage unavailable, and unknown
print/manufacturing readiness. Sharing must distinguish public access from
private account storage; propose a controlled publish flow if access control
does not exist yet.

## Screen and state inventory

Provide each as a full screen, sheet, or panel as appropriate. Avoid inventing
separate routes just to increase the screen count.

| Surface | Required contents and variations |
| --- | --- |
| Landing | Clear 3D value proposition, honest example, text/photo entry, limitations, no invented testimonials or traction |
| First use | Minimal onboarding, useful starter objects, text alternative to microphone, optional device permissions |
| Projects/library | Empty, populated, loading, search/filter, rename, duplicate, delete confirmation, restore/error; proposed actions labelled |
| New project | Prompt, reference upload, destination, optional dimensions; progressive disclosure |
| Studio empty | Large canvas, starter prompts, discoverable input, no overwhelming technical panels |
| Studio conversation | User/assistant turns, clarifications, editable brief, selected-object context, references, next actions |
| Studio editing | Selected part, transform/material controls, multi-selection if justified, locked/preserved parts, before/after, undo/redo |
| Generation | Preparing, queued, generating, validating, available draft, finishing, completed, failed, cancelled/cancel-requested |
| Voice | Idle, listening, partial transcript, thinking, speaking, interruption, permission denied, unsupported browser, reconnect; native realtime states marked future |
| Asset/revisions | Thumbnail, name, versions, compare, restore, local edits versus regenerated geometry, failed placeholder never treated as valid output |
| Capture | Photo framing, upload review, device handoff, camera errors, first-image limitation, full scan unavailable |
| Readiness/export | Destination, actual formats, units, validation results, unknown checks, conversion progress/failure, downloadable artifact |
| Shared viewer | Read-only orbit/zoom, metadata, loading, unavailable link, mobile fallback; disclosure before creating a public link |
| Account | Sign-in, email-link states if supported, expired link, save status, signed-out recovery |
| Settings | Appearance, reduced motion, voice/input, privacy/local data, HF setup and quota, capability status; clearly label new settings |
| Help/recovery | Contextual tips, shortcuts, actionable errors, safe diagnostic copy, feedback entry without auto-sending |

For every primary surface, specify empty/loading/success/error/disabled states
and focus behavior. Add offline, WebGL unavailable, large asset/low-memory,
expired auth, save conflict, and unsaved-change states where relevant.

## Visual direction

Aim for a calm, capable creative studio: approachable, tactile, spacious enough
to read, with disciplined information density and a prominent 3D canvas.
Preserve recognizable YIIYA identity where it helps. Avoid tiny terminal-style
body text, excessive glass blur, decorative dashboards, generic purple gradients,
constant motion, or a chat panel that makes the object an afterthought.

Explore three clearly different directions on the SAME populated studio screen:

1. Warm workshop: graphite canvas, warm neutral chrome, restrained amber.
2. Light drafting desk: off-white surfaces, precise lines, crisp dark type.
3. Quiet dark studio: charcoal surfaces, limited accents, readable controls.

Choose one direction and explain the choice in terms of readability, object
inspection, mobile use, and implementation cost. Then carry it across the full
system. Do not stop and wait for approval to complete the package.

Use at most two font families; reuse installed fonts when suitable. Prefer a
readable sans for interface text, with monospace limited to measurements and
technical details. Main readable copy should generally be 14–16px or larger.
Specify component density, spacing, typography, radii, icons, contrast, elevation,
selection colors, and canvas overlays. Light and dark themes must both retain
visible focus and selection contrast against varied object materials.

## Responsive, accessible, and fast

- Desktop at 1440×900, tablet at 768×1024, phone at 390×844; also verify 320px
  width and 200% zoom. Do not simply shrink desktop sidebars onto a phone.
- On mobile, use an intentional canvas/conversation switch or bottom sheet;
  preserve selected-object context, keyboard clearance, and safe areas.
- Keyboard navigation for every action; visible focus; focus return after
  sheets; labelled controls; 44px touch targets; contrast-tested text.
- No hover-only or voice-only actions. Offer button/numeric alternatives to
  dragging and non-canvas access to object selection and properties.
- Screen-reader status announcements should be meaningful and throttled.
  Do not announce every progress tick or transcript fragment.
- Respect reduced motion, distinguish states beyond color, and preserve text
  scaling. Avoid autoplay audio.
- Keep heavy 3D work off critical interaction paths where feasible; propose
  lazy loading, device-aware render quality, thumbnail loading, pause-when-hidden,
  texture budgets, and low-memory fallbacks with implementation notes.
- Performance targets are proposed acceptance goals, not claims: local edit
  feedback under 200ms, conversational response beginning around 1–2 seconds
  under a specified test setup, stable usable viewport frame rate on target
  devices. GPU generation needs measured percentiles, not invented SLAs.

## Required output artifacts

Create these in `design/yiiya-v2/` (adapt source extensions to available tools):

1. `README.md`: how to open the package, artifact index, coverage checklist,
   preview instructions, limitations, and verification performed.
2. `current-state-audit.md`: evidence-linked observations, user impact,
   keep/change/remove recommendation, and distinction between observed and
   inferred problems. Include comparison mockups where possible.
3. `product-spec.md`: primary jobs, scope, success criteria, information
   architecture, navigation map, all journeys, and a current/proposed/blocked
   capability ledger with supporting code paths.
4. `design-system.md`, `tokens.json`, `tokens.css`: primitive/semantic/component
   layers, light/dark themes, typography, spacing, motion, accessibility, and
   component states. Validate actual contrast; do not just claim compliance.
5. `screens/`: editable high-fidelity mockups with a screen/state/breakpoint
   index. Include all listed surfaces, desktop/mobile core journeys, and tablet
   workspace. Produce a browsable contact sheet/gallery.
6. `prototype/`: locally runnable clickable prototype with realistic example
   content. Wire navigation, selection, conversation fixtures, a local edit,
   a queued/failed generation, retry, undo/compare, quota unavailable, and an
   export flow. Label simulated outcomes without cluttering production copy.
   Do not use live AI calls or collect real credentials.
7. `implementation-handoff.md`: component hierarchy, suggested repo mapping,
   event/state contracts, API/backend dependencies, migration plan, and task
   ordering. Each proposed feature needs measurable acceptance criteria.
8. `qa-checklist.md`: walkthrough results, keyboard and mobile checks, visual
   defects fixed, known gaps, and repeatable acceptance scenarios.

The prototype should be functional enough to evaluate the interaction, not a
collection of disconnected screenshots. Screenshots are useful supporting
artifacts, but retain editable sources. Reuse one representative lamp project
across the main journey so changes are easy to compare.

## Implementation priorities to document

P0: free-only enforcement, actionable provider errors, preserved work, honest
exports, readable controls, basic keyboard and mobile usability.

P1: durable generation jobs, complete project state, structured conversation
memory, recoverable save/reconnect, version comparison, reliable local edits.

P2: native realtime voice, semantic/parametric geometry tools, targeted asset
revision, model-quality evaluation, and supported precision workflows.

P3: advanced motion/rigging, robust multi-view reconstruction, collaboration,
and more export destinations only when backed by real implementation.

Do not invent a subscription/paywall, a plugin marketplace, a social feed,
enterprise controls, or team management merely to make the product seem full.
A complete product means the core jobs and their failure/recovery paths work.

## Quality gate before finishing

- Can a new user understand what to do within the empty workspace?
- Can they distinguish a local edit from a generation and keep prior work?
- Is “this part” visibly grounded in selection?
- Are preserved requirements, dimensions, and unknown checks understandable?
- Is every GPU queue/failure state actionable without promising free capacity?
- Does capture match the active single-image capability?
- Can they use the key workflow with a keyboard, touch, and text alone?
- Do export and sharing screens accurately communicate readiness and access?
- Does every future feature have a backend dependency and acceptance test?
- Were the mockups/prototype actually opened and checked at the target sizes?

Finish by linking the actual artifacts and stating the chosen design direction,
the five highest-impact improvements over the current product, what was tested,
and the next three implementation tasks. Do not describe a mockup as shipped
functionality or claim that any backend bug was fixed by a visual redesign.
