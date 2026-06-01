# YIIYA Integration Guide

This is the *visual + UX* layer that sits on top of the Week 1 production
foundation (see `docs/PRODUCTION_FOUNDATION.md`). Wire these in to turn the
foundation into a product users can see.

## 1. Replace the blob — drop `<Stage />` into your canvas

In `components/scene-canvas.tsx`, replace the always-mounted default mesh
with the lifecycle-aware `<Stage />` component:

```tsx
import { Stage } from "@/components/scene/stage";
import { useYiiyaStore } from "@/lib/store";

function SceneCanvas() {
  const stage = useYiiyaStore((s) => s.stage);
  return (
    <Canvas>
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 5, 5]} intensity={0.8} castShadow />
      <Stage state={stage} />
    </Canvas>
  );
}
```

## 2. Bind state-machine events from the SSE stream

Wherever you POST to `/api/scene/generate`, consume the SSE stream and
dispatch into the store:

```ts
import { parseAgentStream } from "@/lib/agent/watchdog";
import { useYiiyaStore } from "@/lib/store";

async function startGeneration(prompt: string) {
  const store = useYiiyaStore.getState();
  store.stageDispatch({ type: "PROMPT_TYPED", text: prompt });
  store.stageDispatch({ type: "GENERATION_STARTED", provider: "tripo" });

  const res = await fetch("/api/scene/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "text-to-3d", prompt, intent: "preview" })
  });

  for await (const event of parseAgentStream(res)) {
    if (event.type === "PROGRESS") {
      store.stageDispatch({ type: "GENERATION_PROGRESS", progress: event.pct, etaMs: event.etaMs });
    }
  }
  // The pipeline emits a final `result` event with the GLB URL; capture it via
  // a small SSE consumer (see app/api/scene/generate/route.ts for the wire shape).
}
```

## 3. Add the stage slice to your existing store

```ts
import { createStageSlice, type StageSlice } from "@/lib/scene/stage-slice";

export const useYiiyaStore = create<YiiyaState & StageSlice>()((set, get) => ({
  // ...existing state and actions...
  ...createStageSlice(set as never, get as never)
}));
```

## 4. AR Quick Look on /p/[slug]

When a project has a generated USDZ + GLB, the published page can show the
"View in your space" button:

```tsx
<ArQuickLook
  usdzUrl={project.usdz_url}
  glbUrl={project.glb_url}
  posterUrl={project.poster_url}
  title={project.title}
/>
```

The component picks the right platform path (Quick Look on iOS, scene-viewer
on Android, plain 3D viewer elsewhere). Generate the USDZ in your worker via
`lib/scene/usdz-export.ts`.

## 5. Plausible on published sites

Mount `<PlausibleAnalytics />` once in `components/published-project.tsx`
(the root component of /p/[slug]). It reads `NEXT_PUBLIC_PLAUSIBLE_DOMAIN`
from env — no script runs if the env is empty.

## 6. First-run landing

Replace whatever's currently on `app/page.tsx` with `<FirstRunLanding />`.
It's intentionally austere — no big gradient, no slop hero — and routes any
prompt into the existing generation pipeline.

## 7. Cursor-as-director

Mount the cursor stack once at the editor root:

```tsx
import { useCursorTrack } from "@/lib/cursor/cursor-track";
import { LassoOverlay } from "@/components/cursor/lasso-overlay";
import { resolveSpan } from "@/lib/cursor/deictic-resolver";

function EditorRoot() {
  const track = useCursorTrack();

  // When voice/text comes in, pre-resolve pronouns before the Architect call:
  const onTranscript = (transcript: string, start: number, end: number) => {
    const resolved = resolveSpan(transcript, start, end, { track });
    fetch("/api/interpret", {
      method: "POST",
      body: JSON.stringify({ transcript: resolved.rewritten, ... })
    });
  };

  return (
    <>
      <LassoOverlay onSelect={(ids) => useYiiyaStore.setState({ selectedIds: ids })} />
      {/* …the rest of the editor… */}
    </>
  );
}
```

Every renderable component must emit `data-yiiya-component-id="…"` so the
cursor track + lasso can find them.

## 8. Brand Kits

The page lives at `/brand-kits` and is auth-gated. The CRUD API at
`/api/brand-kits` enforces ownership via RLS — no manual checks needed.

## 9. Custom domains

POST `{ slug, domain }` to `/api/domains/attach`. The response includes DNS
verification records to show the user. Poll `/api/domains/status/[domain]`
until `verified === true`.

Required env: `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, and optionally
`VERCEL_TEAM_ID`.

## 10. User memory page

The /me/memory page can call `GET /api/memory/profile` to read the notes
YIIYA has learned about the user — and `PATCH` the same endpoint to let them
edit or delete those notes. Visible learning = trust UX.

## 11. Sections — variant-aware Architect output

The Architect should emit `ADD_SECTION { type: "HERO", variant: "hero.cinema-letterbox", ... }`.
Your renderer (the `WebsiteLayer`) dispatches on `variant`. Use
`lib/section-variants/manifest.ts` to validate the variant ID and
`hero-variants.ts::pickHeroVariant()` for safe defaults.

## 12. Alt text

When the renderer encounters an image with empty alt, call
`generateAltBatch` from `lib/critic/alt-text.ts` post-render. Cache by URL
for the session; results persist while the page is open.
