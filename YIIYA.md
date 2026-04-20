# Yiiya Context

## System State

- Product definition: Spatial Design Orchestrator, not a template website builder.
- Operating model: Intent-to-Asset compiler for voice, cursor context, reference images, website sections, and spatial objects.
- Current phase completed: Phase 4 Demo-Safe Text Fallback.
- Active backend route: `/api/interpret`.
- Interpreter pipeline: Architect agent generates semantic JSON actions, Critic agent validates/fixes contrast, mobile overflow, hierarchy, payload shape, and semantic action quality before returning JSON to the frontend.
- Provider support: `AI_PROVIDER=anthropic` uses Anthropic Messages API; `AI_PROVIDER=gemini` uses Gemini generateContent.
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

## Semantic Action Contract

- `SET_GLOBAL_THEME`
- `SYNC_BRAND_TO_IMAGE`
- `ADJUST_DENSITY`
- `ADD_SPATIAL_OBJECT`
- `ADD_SECTION`
- `MODIFY_ELEMENT`
- `PUBLISH`
- Legacy compatibility: `ADD_3D_OBJECT`, `CHANGE_THEME`.

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
