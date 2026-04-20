# Yiiya Context

## System State

- Product definition: Spatial Design Orchestrator, not a template website builder.
- Operating model: Intent-to-Asset compiler for voice, cursor context, reference images, website sections, and spatial objects.
- Current phase completed: Phase 8 Section Library v2.
- Active backend route: `/api/interpret`.
- Active publish route: `/api/publish`.
- Active status route: `/api/status`.
- Interpreter pipeline: Architect agent generates semantic JSON actions, Critic agent validates/fixes contrast, mobile overflow, hierarchy, payload shape, and semantic action quality before returning JSON to the frontend.
- Interpreter fallback: if the selected model is unavailable or fails, `/api/interpret` uses a deterministic local compiler for common demo/business commands.
- Provider support: Gemini is the default fast path (`AI_PROVIDER=gemini`, `GEMINI_MODEL=gemini-1.5-flash`). Anthropic remains available with `AI_PROVIDER=anthropic`.
- MCP status: no Supabase or Vercel MCP resources are exposed in this session. Supabase schema is tracked locally.

## Active Design Tokens

- Token module: `lib/designSystem.ts`.
- Theme interface: `YiiyaTheme`.
- Required token contract implemented: `spacingMultiplier`, `borderRadius`, `primaryAccent`, `fontScale`, `layoutDensity`.
- Additional active tokens: `background`, `foreground`, `mutedForeground`, `surface`, `border`, `fontWeight`, `palette`.
- Compiler: `compileYiiyaTheme(theme)` emits spacing scale and type scale.
- Fuzzy vibe mapping: `themeFromVibe(vibe)` maps luxury/watch/premium, institutional/terminal/Bloomberg, and playful/bright/viral phrases to strict token values.
- State source of truth: `useYiiyaStore().themeState`.
- Renderer source of truth: `WebsiteLayer` consumes compiled tokens. Sections no longer own hardcoded spacing, radius, font sizing, or accent values.

## Schema Version

- Supabase schema version: `0001_projects`.
- Table: `public.projects`.
- Columns: `id uuid`, `slug text`, `owner_id uuid`, `content_json jsonb`, `theme_json jsonb`, `created_at timestamptz`.
- RLS: enabled.
- Read policy: public select for published slug retrieval.
- Write policy: authenticated owner insert/update/delete.
- Runtime write path: `/api/publish` uses `SUPABASE_SERVICE_ROLE_KEY` to insert published rows with `owner_id = null`.
- Runtime read path: `/p/[slug]` uses `NEXT_PUBLIC_SUPABASE_ANON_KEY` to server-render public project rows.

## Semantic Action Contract

- `SET_GLOBAL_THEME`
- `SYNC_BRAND_TO_IMAGE`
- `ADJUST_DENSITY`
- `ADD_SPATIAL_OBJECT`
- `ADD_SECTION`
- `MODIFY_ELEMENT`
- `PUBLISH`
- Legacy compatibility: `ADD_3D_OBJECT`, `CHANGE_THEME`.
- Section library: `NAVBAR`, `HERO`, `ABOUT`, `SERVICES`, `FEATURES`, `METRICS`, `TESTIMONIALS`, `PRICING`, `FAQ`, `CONTACT`, `FOOTER`.

## Phase 2 Implementation Notes

- `SET_GLOBAL_THEME` updates global tokens.
- `SYNC_BRAND_TO_IMAGE` maps extracted palette, visual tone, and font weights into tokens.
- `ADJUST_DENSITY` clamps scale to `0.5..2.0` and maps to compact/balanced/spacious.
- `MODIFY_ELEMENT` supports relative `mode` values: `multiply`, `increment`, `replace` fallback.
- `ADD_SPATIAL_OBJECT` preserves material as `Glass`, `Chrome`, or `Matte` for R3F rendering.

## Phase 3 Implementation Notes

- Editor shell palette: `#050505` background, `#1A1A1A` borders, `#EDEDED` text.
- Editor UI typography: monospace-first stack with JetBrains Mono / Geist Mono fallbacks.
- Right panel: AI Log is now a System Operation Feed with timestamped semantic operations instead of raw JSON payloads.
- Voice bar states: `Listening...` uses fluorescent green `#39FF14`; `Thinking...` uses amber `#FFB100`; idle remains dim.
- Operation feed language: interpret, compile, theme, density, spatial, modify, publish events are formatted for demo-readable system telemetry.

## Phase 4 Implementation Notes

- Voice bar now includes a manual typed command input for accessibility, noisy rooms, and live-demo safety.
- Typed commands reuse the same `/api/interpret` pipeline as speech, including active element context, reference image context, current scene state, Architect, Critic, and action runner.
- Spacebar voice capture remains disabled while typing because input targets are excluded from the global keyboard listener.
- Manual commands can repeat intentionally, while speech final-result de-duping still prevents duplicate Web Speech submissions.

## Phase 5 Implementation Notes

- Publish now attempts durable cloud storage first through `/api/publish`.
- Published rows are inserted into `public.projects` with `slug`, `content_json`, `theme_json`, and Supabase timestamps.
- `/p/[slug]` now reads Supabase from the server and passes the published JSON into the renderer for an SEO-friendlier first render.
- Browser localStorage remains as a development fallback when Supabase env vars are not configured or cloud publish fails.
- Required Vercel env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

## Phase 6 Implementation Notes

- Added `lib/local-intent-compiler.ts` as a deterministic fallback for common creation commands.
- Fallback supports site generation, HERO/ABOUT/FEATURES/CONTACT sections, density changes, vibe theme presets, active-element relative edits, spatial objects, reference-image intent hints, and publish commands.
- `/api/interpret` now returns fallback actions with `x-yiiya-interpreter: local-fallback` when the selected LLM provider is missing or fails.
- The voice/manual command pipeline logs `INTERPRET: Fast local compiler fallback.` when fallback actions are used.
- Added `/api/status` to report AI/Supabase configuration booleans without exposing secrets.

## Phase 7 Implementation Notes

- `/api/interpret` accepts `history` and `current_canvas_json` while preserving legacy `currentScene` compatibility.
- Voice/manual commands send the last five Yiiya messages plus the selected element's computed style snapshot for contextual follow-up edits.
- Local compiler now resolves selected-element follow-ups such as center/middle, more/less, bigger/smaller, and basic color/radius commands.
- Local compiler maps 3D phrases such as glass sphere, chrome cube, floating plane, and behind hero to `ADD_3D_OBJECT`.
- Added `resetProject()` to Zustand. It clears sections, scene objects, selection, reference image, theme tokens, layers, and message history.
- Added a minimal New Project icon button in the top bar.
- Added debounced 2000ms draft autosave via `/api/projects/autosave`; cloud autosave uses Supabase service role and falls back to browser draft storage when unavailable.
- Publish uses the current project slug so autosaved drafts upgrade into clean published artifacts.
- Workspace wraps the canvas/rendering layer in React Suspense to keep the command surface responsive during rendering work.

## Phase 8 Implementation Notes

- Expanded `SectionType` beyond the original four-section prototype.
- Added token-aware renderers for `NAVBAR`, `SERVICES`, `METRICS`, `TESTIMONIALS`, `PRICING`, `FAQ`, and `FOOTER`.
- Updated the Architect prompt to advertise the full section library.
- Updated the local intent compiler so business prompts can request services, metrics/stats, testimonials/reviews, pricing/plans, FAQ/questions, navbar/navigation, and footer.
- Full-site fallback generation now produces `NAVBAR`, `HERO`, `ABOUT`, `FEATURES`, `CONTACT`, and `FOOTER` by default, with optional business sections added when requested.
