# Implementation handoff — YIIYA v2

For engineers turning the prototype into the Next.js app. The prototype is
vanilla JS so it runs anywhere; **do not port its code** — port its structure,
states and copy into React components backed by the existing Zustand store
and API routes. Proposed features are marked with their priority and each has
a backend dependency and measurable acceptance criteria.

## 1. Component hierarchy (target)

```
app/layout.tsx                         Inter + JetBrains Mono via next/font; tokens.css import; data-theme
app/page.tsx                           <Landing>
app/app/page.tsx                       <Studio>
app/projects/page.tsx (was /library)   <ProjectsPage>
app/capture/page.tsx                   <PhoneCapture>
app/view/page.tsx                      <SharedViewer>
app/auth/callback/page.tsx             <AuthCallback>  (new)

<Studio>
├─ <StudioTopBar>            brand · <ProjectName> · <SavePill> · nav · Share · Export
├─ <Banners>                 offline · sign-in expired · conflict(P1)
├─ <StudioLayout mode="desktop|tablet|phone">     useLayoutMode() — 1280 / 768 breakpoints
│  ├─ <ConversationPanel>
│  │  ├─ <MessageList>        <UserMessage> <AssistantNote> <ActionCard type> <SystemLine>
│  │  └─ <Composer>           <ContextChips> <PromptInput> <MicButton> <SendButton> <ComposerMeta>
│  ├─ <CanvasStage>
│  │  ├─ <SceneCanvas>        (existing components/scene-canvas.tsx, frameloop="demand")
│  │  ├─ <CanvasEmptyState>   starters · photo · first steps
│  │  ├─ <VersionChip> <ViewToolbar> <SelectionPill> <ScalePill> <PendingVersionBanner>
│  │  ├─ <InstantEditStrip>
│  │  ├─ <GenerationCard>     phases · elapsed · stop · failures
│  │  └─ <CanvasFallback>     WebGL/low-memory poster
│  └─ <Inspector tabs=Brief|Part|Versions>   (tablet/phone: <SidePanel tabs=Chat|Brief|Part|Versions>)
│     ├─ <BriefPanel>   (P1 data)
│     ├─ <PartPanel>    parts list · colour swatches · finish(P2) · shape(P2) · keep toggle · whole-object size
│     └─ <VersionsPanel> versions · compare · history · undo/redo
└─ <SheetHost>   ExportSheet · ShareSheet · SettingsSheet · AccountSheet · PhotoSheet · NewProjectSheet
                 HelpSheet · FeedbackSheet · TechDetailsSheet · CompareSheet · RenameSheet · SaveStatusSheet
                 ConflictSheet(P1) · MenuSheet(phone)
```

Shared primitives (`components/ui/`): `Button`, `IconButton`, `Chip`, `Badge`
(`ActionBadge`), `FutureTag`, `Notice`, `Tabs`, `Segmented`, `Sheet` (focus
trap + return, Esc, bottom sheet < 768 px), `Toast`, `Spinner`, `Icon`.

## 2. Suggested repo mapping

| Prototype file | Becomes | Notes |
| --- | --- | --- |
| `tokens.json`, `tokens.css` | `styles/tokens.css` + Tailwind `theme.extend` mapping to CSS vars | Keep `build-tokens.mjs` and `check-contrast.mjs` under `scripts/design/`; add `npm run check:contrast` to CI |
| `prototype/app.css` | Tailwind utilities + `components/ui/*` | Replace `text-[8px]`… everywhere (144 uses) |
| `prototype/core.js` (icons, sheets, announce) | `components/ui/icon.tsx`, `components/ui/sheet.tsx`, `lib/a11y/announce.ts` | `announce()` throttles identical messages for 4 s |
| `prototype/engine.js` routing | `lib/scene/local-edit.ts` (extend), `lib/studio/route-intent.ts` (new) | Keep the pure classifier; add sentence splitting ("Undo that. Make it…"), height parsing, keep-phrase extraction, pending-version undo |
| `prototype/engine.js` generation sim | `lib/studio/generation-machine.ts` (new) | Explicit state machine (see §3) fed by pipeline events |
| `prototype/studio.js` | `components/studio/*` | Replaces `LeftPanel`/`RightPanel`/`Toolbar` in `components/yiiya-workspace.tsx` |
| `prototype/pages.js` | `app/page.tsx`, `app/projects/page.tsx`, `app/capture/page.tsx`, `app/view/viewer.tsx`, `app/auth/callback/page.tsx` | Capture: remove orbit in free-only |
| `prototype/sheets.js` | `components/sheets/*` | |
| `prototype/lamp3d.js` selection hull | `components/scene/selection-outline.tsx` | Outline + luminance-adaptive halo |

## 3. State contracts

### 3.1 Store additions (`lib/store.ts`)

```ts
type ActionType = "local" | "generative" | "parametric" | "unsupported";

type Version = {
  id: string; n: number;
  kind: "generated" | "regenerated" | "parametric";
  label: string;
  assetId: string;               // GeneratedAsset.id (never a fallback asset)
  basedOn: string | null;
  edits: MaterialOverride & { regions?: RegionEdit[] };   // instant edits on top of the mesh
  createdAt: string;
};

type Op = {                      // undo/redo entries
  id: string; type: "local" | "parametric" | "version";
  label: string; base?: boolean; // base ops (first version) are not undoable
  before: { versionId: string | null; edits: Version["edits"] };
  after:  { versionId: string | null; edits: Version["edits"] };
};

type Brief = {                   // P1
  object: string;
  parts: { id: string; label: string }[];
  size: { value: number; unit: "mm" | "cm" | "m" | "in"; basis: "estimated" | "exact" } | null;
  materials: string[]; style: string;
  destination: "unset" | "render" | "ar" | "print" | "engine";
  references: string[];          // reference ids, not base64
  keep: { partId: string | null; text: string }[];
  questions: string[];
};

type GenerationState =
  | { phase: "idle" }
  | { phase: "preparing" | "queued" | "generating" | "validating" | "draft" | "finishing";
      jobId: string | null; kind: "new" | "revision"; startedAt: number; restored?: boolean }
  | { phase: "reconnecting"; jobId: string; startedAt: number }               // P1
  | { phase: "cancel-requested" | "cancelled"; jobId: string | null }
  | { phase: "failed"; error: GenerationError; attempts: ProviderAttempt[] }
  | { phase: "interrupted" }                                                  // current, no job id
  | { phase: "completed"; versionId: string };

type GenerationError =
  | "hf-unavailable" | "daily-limit" | "missing-setup" | "asleep" | "invalid" | "network";
```

Persist (browser): versions, ops (last 50), brief, messages (last 100),
selection id, pending version id. Never persist `isListening`,
`GenerationState` except `jobId` (P1, for resume).

### 3.2 Pipeline → UI event mapping

| Pipeline event (today) | UI phase / effect |
| --- | --- |
| request accepted | `preparing` |
| `generating` "[PROVIDERS] Hugging Face only…" | `queued` (until first provider attempt starts — add an explicit `{type:"phase",phase:"queued"}`) |
| provider attempt started | `generating` (add `{type:"phase",phase:"generating"}`) |
| `validateGlbUrl` running | `validating` (add phase event) |
| mesh ready before textures | `draft` (P1, new `{type:"draft",glbUrl}` event) |
| `generatePBRTextures`/packaging | `finishing` |
| `asset_ready` with tier ≠ fallback | create Version; new → in use; revision → `pendingVersion` |
| `asset_ready` with tier = fallback | **do not** create a version; `failed` with mapped error |
| `error` / guard 429 `daily_generation_limit` | `failed: daily-limit` with server `reset` |
| missing HF token message | `failed: missing-setup` |
| all attempts 429/quota | `failed: hf-unavailable` |
| all attempts timeout | `failed: asleep` |
| validation failed for all | `failed: invalid` |
| fetch TypeError / watchdog | `interrupted` (current) · `reconnecting` (P1) |
| `clarify` | ActionCard type=clarify, no generation spent |

Remove the numeric `progress` field from `PipelineEvent` (it is invented) or
mark it `@deprecated` and never render it.

### 3.3 UI events (analytics-safe; no prompts, tokens or file URLs)

`studio_opened{layout}`, `prompt_submitted{source: text|voice|starter|photo, hasSelection}`,
`action_routed{type}`, `instant_edit_applied{kind: color|finish|scale, target: part|whole}`,
`revision_confirmed`, `version_compared`, `version_chosen{choice: new|keep}`,
`generation_phase{phase}`, `generation_failed{error}`, `generation_stopped`,
`undo{type}`, `export_downloaded{format,destination}`, `share_link_created`,
`capture_step{step}`.

## 4. Backend / API dependencies

| Feature | Priority | Dependency | Acceptance criteria |
| --- | --- | --- | --- |
| Distinct failure states | P0 | Map cascade `attempts` to `GenerationError` server-side; return `reset` only from YIIYA guard | Unit tests: each attempt pattern → one error kind; UI never shows a reset time for `hf-unavailable` |
| Failed generations never become versions | P0 | Client: ignore `tier:"fallback"` in version creation | Test: fallback asset_ready → no new Version, failure card shown, current version unchanged |
| Undo of instant edits & version switches | P0 | Store ops | Test: matte → undo restores previous material within 1 frame; "Undo that" after revision declines pending version |
| Single-photo phone handoff | P0 | `/api/capture-session` accepts 1 view; capture page drops orbit when `generationMode()==="free-only"` | Phone sends 1 photo; laptop shows "Photo received"; no orbit UI in free-only |
| Export disclosures (edits not baked, STL metres, USDZ unavailable) | P0 | none (copy) | Export sheet lists these whenever applicable; no FBX/STEP/BLEND offered |
| Public share disclosure | P0 | none (copy) | Link not created until the user ticks the acknowledgement |
| Readable UI | P0 | Tokens + Tailwind mapping | No text < 12 px (lint rule banning `text-[8–11px]`); axe: 0 serious contrast issues; controls ≥ 36 px desktop, 44 px coarse |
| Durable generation jobs | P1 | `generation_jobs` table (id, owner/session, status, phase, attempts, result asset, error, created/updated), worker or background function, `GET /api/jobs/:id`, `POST /api/jobs/:id/cancel`, client resume on reconnect using persisted `jobId` | Kill network mid-queue → reconnect within 60 s shows the same job phase; result arrives without resubmitting; cancel stops future attempts and is reflected in status |
| Draft before finishing | P1 | Emit `draft` event after validation, before textures | Draft visible ≥ 5 s before completion on a scripted run; exports enabled only at `completed` |
| Bake instant edits into exports | P1 | `/api/3d/convert` accepts `edits` (material override, scale, region vertex colours) and applies with gltf-transform | Downloaded GLB opened in Blender shows the matte finish/black base/35 cm; OBJ/STL use baked scale |
| Persist region edits | P1 | Store region vertex indices + colour per version | Reload keeps part colours; undo removes them |
| Structured brief | P1 | Brief schema in project; sent as `brief` in `/api/interpret/stream`; Director prompt reads it | "Keep the shade" stated in turn 3 is present in request payloads for turns 4–10 (test) |
| Projects model + library actions | P1 | `projects` table (conversation, versions, brief, updated_at, revision); search/rename/duplicate/delete endpoints | Reopen restores 10 turns, 3 versions, current version and brief; delete requires confirmation; failures show retry and keep browser copies |
| Save conflict detection | P1 | `revision` integer, compare-and-set on save | Two tabs editing → second save shows conflict sheet, no silent overwrite |
| Controlled publishing | P1 | `shares` table (project/version, visibility, allow_download, revoked_at), signed/proxied file URLs | Revoked link returns "not available" within 1 min; private projects not accessible by GLB URL |
| STL in millimetres option | P1 | Scale ×1000 in `glbToStl` when `units=mm` | 35 cm lamp imports as 350 mm in PrusaSlicer/Cura |
| Named parts / exact edits | P2 | Part segmentation or parametric templates for common desk objects; constraint validator | Thinner neck changes only neck vertices (Hausdorff distance of shade = 0 within tolerance); height constraint verified by bounding box ± 0.1 mm |
| Realtime voice | P2 | Realtime speech session (server), barge-in, reconnect | Speaking/interrupt/reconnect states shown; text remains fully functional; no autoplay without a user gesture |
| Model-quality evaluation | P2 | Prompt set + human rating rubric per Space | Published p50/p90 time and quality score per Space, refreshed weekly |
| Watertight / thickness checks | P2 | Mesh analysis worker | Checks move from "Not checked" to measured values |

## 5. Migration plan (incremental, no big-bang)

1. **Tokens & primitives** — add `tokens.css`, Tailwind mapping, `components/ui/*`,
   fonts via `next/font`. No behaviour change. Gate: contrast script in CI.
2. **Studio shell** — new `StudioLayout` with responsive modes wrapping the
   existing `SceneCanvas`; composer replaces the log input; logs move to a
   "Technical details" sheet. Keep `useSpeechInterpreter` API.
3. **Messages & action cards** — map existing store logs/messages to typed
   messages; reuse clarify and edit-confirm logic as cards.
4. **Generation card + failure mapping (P0)** — phase events from the pipeline;
   failure kinds; stop copy.
5. **Versions, undo, compare (P0/P1)** — versions from `generatedAssets`
   (excluding fallback), ops stack, pending version + compare sheet.
6. **Selection access** — selection pill/chip, parts list (P2 for names),
   crosshair pick (P0/P1).
7. **Export / share sheets (P0 copy)** — disclosures; then P1 baking.
8. **Capture** — single-photo phone handoff; camera-denied upload fallback.
9. **Projects page** — rename `/library` → `/projects` with redirect; browser
   projects shown when signed out.
10. **Landing copy & example** — remove overclaims and spinning icosahedron.

Each step ships behind no flag except where noted; P1 backend work proceeds in
parallel from step 4.

## 6. Task order (next three)

1. **Readable shell + composer + typed messages** (steps 1–3). Acceptance: no
   text < 12 px in studio; mobile 390 px shows the composer on load; starters
   visible on first visit; keyboard-only user can send, select a part from the
   list, and open Export.
2. **Generation state machine + failure mapping + versions/undo** (steps 4–5).
   Acceptance: all six failure kinds reproducible with mocked pipeline events;
   failed runs never change the current version; undo restores instant edits.
3. **Durable generation jobs (P1 backend)**. Acceptance: see §4 table row.

## 7. Accessibility implementation notes

- One polite `role=status` region for generation phase changes and edits; one
  `role=alert` for blocking failures. Don't announce transcript fragments or
  elapsed ticks.
- Canvas: focusable group with `aria-describedby` instructions; arrows rotate,
  ± zoom, 0 resets; never trap Tab. All canvas actions have buttons.
- Sheets: focus to title or `[data-autofocus]`, trap Tab, Esc closes, return
  focus to the trigger (fallback: composer).
- Hold-Space only when focus is on `body`; never when typing.
- `prefers-reduced-motion`: no camera easing, no materialise scale-in, spinner slowed.

## 8. Performance notes

- Keep `SceneCanvas` dynamically imported; add `frameloop="demand"` and
  `invalidate()` on param/selection changes; pause on `visibilitychange`.
- Version thumbnails: reuse `assetPosters` (already captured) instead of
  rendering extra canvases; compare view uses posters/two cameras on one canvas.
- Measure: local-edit latency (performance marks around `applyLocalMaterialEdit`
  → next frame), time-to-first-assistant-card, GPU phase durations per Space.
