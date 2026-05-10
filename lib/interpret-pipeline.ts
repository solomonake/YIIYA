import { fal } from "@fal-ai/client";
import OpenAI from "openai";
import {
  heuristicCreativeBrief,
  inferSpatialAssetFamily,
  type CreativeBrief
} from "@/lib/creative-brief";
import { compileLocalIntent } from "@/lib/local-intent-compiler";
import type { YiiyaAction } from "@/lib/store";
import type { CursorTarget } from "@/lib/scene/types";

export type IntentType = "LAYOUT" | "SPATIAL" | "STYLE" | "COMMAND" | "QUESTION";

export type ReferenceImageInput = {
  base64: string;
  mediaType: string;
  name: string;
  dominantColor?: string;
  accentCandidate?: string;
  extractedMode?: "dark" | "light";
  imageMode?: "web" | "3d" | "hybrid";
  aspectRatio?: number;
  silhouette?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

export type InterpretRequestBody = {
  transcript: string;
  activeElementId: string | null;
  currentScene?: object;
  current_canvas_json?: object;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  referenceImage?: ReferenceImageInput | null;
  image_mode?: "web" | "3d" | "hybrid";
  partial?: boolean;
  strategyMode?: boolean;
  creationGoal?: "web" | "spatial" | "scan";
  canvasMode?: "WEB" | "3D" | "HYBRID";
  starterPromptId?: string | null;
  scanJobId?: string | null;
  scanSessionId?: string | null;
  cursorTarget?: CursorTarget | null;
};

export type ResearchBrief = {
  industry: string;
  audience: string;
  offer: string;
  usps: string[];
  copyAngles: string[];
  imageQueries: string[];
  imageUrls: string[];
  citations: Array<{ title: string; uri: string }>;
};

export type PipelineEvent =
  | {
      type: "router";
      intent: IntentType;
      model: string;
      log: string;
      brief?: CreativeBrief | null;
      confidence?: number;
      fallbackPath?: string | null;
    }
  | { type: "research"; brief: ResearchBrief | null; log: string }
  | { type: "actions"; actions: YiiyaAction[]; log?: string }
  | { type: "qa"; qa_log: string[] }
  | { type: "question"; question: string }
  | {
      type: "done";
      actions: YiiyaAction[];
      qa_log: string[];
      brief?: CreativeBrief | null;
      confidence?: number;
      fallbackPath?: string | null;
    }
  | { type: "error"; message: string };

function fastGeminiModel() {
  return process.env.GEMINI_FLASH_MODEL ?? "gemini-2.5-flash";
}

function creativeGeminiModel() {
  return process.env.GEMINI_CREATIVE_MODEL ?? process.env.GEMINI_3_CREATIVE_MODEL ?? fastGeminiModel();
}

function researchGeminiModel() {
  return process.env.GEMINI_RESEARCH_MODEL ?? fastGeminiModel();
}

const ARCHITECT_PROMPT = `You are the Architect agent for Yiiya.
Return raw JSON array only. Never return HTML.
Yiiya compiles human intent into semantic section actions and layout tokens.
Aesthetic: SRL institutional, #050505, #1A1A1A borders, amber accent, JetBrains Mono, editorial art direction.
Do not use a fixed template recipe. Choose an archetype that fits the prompt: brand-poster, service-business, creative-portfolio, interactive-concept, or reference-rebuild.
Every section content payload may include visual, interaction, and designDNA tokens. Use these tokens to make the renderer adapt instead of repeating the same page.
If a reference image is present, mirror its composition, crop, visual density, palette, and image role. Include visual.source="reference-image" and visual.fidelity="mirror-composition" where useful.
If cursorTarget is present, resolve words like this, that, here, it, and this one against that target.
Never use "New Venture", "Company Name", Lorem Ipsum, or placeholder image services unless the user literally requested those words.
Supported actions:
ADD_SECTION payload { sectionType, layoutVariant, theme, content }
MODIFY_ELEMENT payload { elementId, property, value, mode? }
SET_GLOBAL_THEME payload { spacingMultiplier?, borderRadius?, primaryAccent?, fontScale?, layoutDensity?, palette?, fontWeight? }
SYNC_BRAND_TO_IMAGE payload { palette, fontWeights, layoutStructure, visualTone }
ADJUST_DENSITY payload { scale }
ADD_3D_OBJECT payload { prompt?, resolvedName?, shape?, modelUrl?, tier?, style?, material, color, animation, position, scale?, anchorSection? }
PUBLISH payload {}
Supported sections: NAVBAR, HERO, ABOUT, SERVICES, FEATURES, METRICS, LOGO_STRIP, TESTIMONIALS, PRICING, FAQ, CONTACT, FOOTER.
Hero layoutVariant must be CENTERED_IMPACT, EDITORIAL_SPLIT, or BENTO_GRID.
Features layoutVariant must be FEATURES_GRID or FEATURES_HORIZONTAL.
For "center this", "move words to center", "align this", use MODIFY_ELEMENT targeting selectedElementId with property textAlign, justifyContent, alignItems, or layoutAlignment.
If researchBrief is present, use it. No Lorem Ipsum. No Company Name. No placeholder image services.
Every page-level generation must include at least one CTA.`;

const STYLE_PROMPT = `You are the Style agent for Yiiya.
Return raw JSON array only. Handle only theme, typography, spacing, alignment, and selected element edits.
Use SRL institutional defaults unless user explicitly asks otherwise.
If selectedElementId or cursorTarget is present and the user says this, it, or that, target that selection.`;

const ALCHEMIST_PROMPT = `You are the 3D Director and Alchemist for Yiiya.
Return raw JSON array only.
Supported actions:
DIRECT_SCENE payload { tracks: [{ timestampMs: number, actions: action[] }] } - Use this to choreograph scenes over time (e.g., spawn object at 0ms, move it at 2000ms).
MOLD_BLOB payload { targetShape?: 'sphere'|'bottle'|'cube'|'organic'|'crystal', formation?: 'sphere'|'helix'|'torus'|'bottle'|'capsule'|'cube'|'wave', distort?: number, speed?: number, aspectRatio?: number, glow?: number, chaos?: number, twist?: number, particleDensity?: number, material?: string }
MORPH_BLOB payload { targetShape: 'sphere'|'bottle'|'cube'|'organic'|'crystal', formation?: 'sphere'|'helix'|'torus'|'bottle'|'capsule'|'cube'|'wave', distort: number, speed: number, aspectRatio?: number, silhouette?: object, material?: string }
SET_MATERIAL payload { objectId: string, material: string, metalness?: number, roughness?: number, color?: string, transmission?: number, emissive?: string }
ADD_3D_OBJECT payload { prompt?: string, resolvedName?: string, shape?: string, modelUrl?: string, tier?: 'library'|'stylized'|'generated', style?: string, material: 'glass'|'chrome'|'gold'|'matte'|'carbon'|'holographic', color?: string, scale?: [number,number,number], position?: [number,number,number], animation?: 'rotate'|'float'|'pulse'|'spin'|'drift'|'static', intensity?: number, anchorSection?: string, physicsBody?: 'dynamic'|'fixed'|'kinematicPosition', mass?: number }
LOAD_3D_MESH payload { url: string, prompt?: string, resolvedName?: string, style?: string, tier?: 'generated', material?: string, color?: string, scale?: [number,number,number], position?: [number,number,number], anchorSection?: string, physicsBody?: 'dynamic'|'fixed' }
MOVE_OBJECT payload { objectId: string, delta?: [number,number,number], position?: [number,number,number] }
SET_OBJECT_ANIMATION payload { objectId: string, animation: 'rotate'|'float'|'pulse'|'spin'|'static', intensity?: number }
SPAWN_CONTROL payload { id: string, label: string, min: number, max: number, step?: number, value: number, target: 'blob'|'theme'|'section'|'object', property: string }
REMOVE_OBJECT payload { objectId: string }
If the user asks for a sequence of events, a scene, a choreography, or a script, wrap your actions in DIRECT_SCENE tracks.
If the user says "drop", "throw", "bounce", or "physics", add physicsBody: "dynamic" to the ADD_3D_OBJECT payload.
Prefer concrete resolved objects like cup, bottle, laptop, phone, watch, chair, car, shoe, bust, pedestal, camera, bag, or plant before falling back to abstract shapes.
Map "make it gold" directly to SET_MATERIAL with metalness 1, roughness 0.2, color "#FFD700".`;

const CRITIC_PROMPT = `You are the Critic agent for Yiiya. You receive design action JSON and return raw JSON only in this shape: { "actions": [...], "qa_log": [...] }.
Silently correct:
1. Contrast below 4.5:1.
2. Mobile overflow risk or oversized fixed widths.
3. Visual imbalance across sections.
4. Missing CTA in page-level generations.
5. 3D lighting/background material mismatch.
Use qa_log strings exactly like "[QA]: Contrast check passed." or "[QA]: Mobile overflow corrected." and "[SYSTEM]: Syncing 3D light-source to background palette."`;

function requireEnv(name: string) {
  const value = process.env[name];

  if (!value || value.includes("your_") || value.includes("YOUR_")) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function isInterpretRequest(value: unknown): value is InterpretRequestBody {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.transcript === "string" &&
    (typeof value.activeElementId === "string" || value.activeElementId === null) &&
    (isRecord(value.currentScene) || isRecord(value.current_canvas_json))
  );
}

function parseJsonFromText(text: string) {
  const trimmed = text.trim();

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/) ?? trimmed.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);

    if (!match?.[1]) {
      throw new Error("Model response was not valid JSON");
    }

    return JSON.parse(match[1]) as unknown;
  }
}

function parseActionArray(text: string): YiiyaAction[] {
  const parsed = parseJsonFromText(text);

  if (!Array.isArray(parsed)) {
    throw new Error("Model response was not an action array");
  }

  return parsed as YiiyaAction[];
}

function parseCritic(text: string, fallbackActions: YiiyaAction[]) {
  const parsed = parseJsonFromText(text);

  if (!isRecord(parsed) || !Array.isArray(parsed.actions)) {
    return {
      actions: fallbackActions,
      qa_log: ["[QA]: Critic skipped — malformed output."]
    };
  }

  return {
    actions: parsed.actions as YiiyaAction[],
    qa_log: Array.isArray(parsed.qa_log)
      ? parsed.qa_log.filter((item): item is string => typeof item === "string")
      : ["[QA]: Critic check passed."]
  };
}

function buildContext(body: InterpretRequestBody, researchBrief: ResearchBrief | null) {
  return JSON.stringify(
    {
      previousContext: body.history?.slice(-5) ?? [],
      currentCommand: body.transcript,
      creationGoal: body.creationGoal ?? "web",
      canvasMode: body.canvasMode ?? "HYBRID",
      starterPromptId: body.starterPromptId ?? null,
      scanJobId: body.scanJobId ?? body.scanSessionId ?? null,
      selectedElement: body.activeElementId ?? "none",
      currentCanvas: body.current_canvas_json ?? body.currentScene,
      cursorTarget: body.cursorTarget ?? null,
      imageMode: body.image_mode ?? body.referenceImage?.imageMode ?? "none",
      referenceImageExtraction: body.referenceImage
        ? {
            dominantColor: body.referenceImage.dominantColor,
            accentCandidate: body.referenceImage.accentCandidate,
            extractedMode: body.referenceImage.extractedMode,
            aspectRatio: body.referenceImage.aspectRatio,
            silhouette: body.referenceImage.silhouette
          }
        : null,
      researchBrief,
      strategyMode: Boolean(body.strategyMode)
    },
    null,
    2
  );
}

async function callAnthropic(system: string, text: string, model: string, maxTokens = 1400) {
  const apiKey = requireEnv("ANTHROPIC_API_KEY");
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature: 0,
      system,
      messages: [{ role: "user", content: [{ type: "text", text }] }]
    })
  });

  if (!response.ok) {
    throw new Error(`Anthropic request failed: ${await response.text()}`);
  }

  const data = (await response.json()) as {
    content?: Array<{ type: "text"; text: string }>;
  };

  return data.content?.map((block) => block.text).join("").trim() ?? "";
}

async function callGemini(system: string, text: string, model: string, grounded = false) {
  const apiKey = requireEnv("GEMINI_API_KEY");
  const body: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text }] }],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 1600,
      responseMimeType: "application/json"
    }
  };

  if (grounded) {
    body.tools = model.includes("1.5")
      ? [
          {
            google_search_retrieval: {
              dynamic_retrieval_config: {
                mode: "MODE_DYNAMIC",
                dynamic_threshold: 0
              }
            }
          }
        ]
      : [{ google_search: {} }];
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }
  );

  if (!response.ok) {
    throw new Error(`Gemini request failed: ${await response.text()}`);
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      groundingMetadata?: {
        groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>;
      };
    }>;
  };

  return {
    text:
      data.candidates?.[0]?.content?.parts
        ?.map((part) => part.text ?? "")
        .join("")
        .trim() ?? "",
    citations:
      data.candidates?.[0]?.groundingMetadata?.groundingChunks
        ?.map((chunk) => ({
          title: chunk.web?.title ?? "source",
          uri: chunk.web?.uri ?? ""
        }))
        .filter((chunk) => Boolean(chunk.uri)) ?? []
  };
}

async function callOpenAIVision(body: InterpretRequestBody) {
  const image = body.referenceImage;

  if (!image) {
    throw new Error("Alchemist vision requires a reference image");
  }

  const client = new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") });
  const response = await client.chat.completions.create({
    model: process.env.OPENAI_VISION_MODEL ?? "gpt-4o",
    temperature: 0,
    messages: [
      {
        role: "system",
        content: ALCHEMIST_PROMPT
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: buildContext(body, null)
          },
          {
            type: "image_url",
            image_url: {
              url: `data:${image.mediaType};base64,${image.base64}`
            }
          }
        ]
      }
    ]
  });

  return parseActionArray(response.choices[0]?.message.content ?? "[]");
}

async function maybeGenerateTrellisMesh(body: InterpretRequestBody): Promise<YiiyaAction[]> {
  if (body.scanJobId ?? body.scanSessionId) {
    return [];
  }

  const image = body.referenceImage;

  if (!image || (body.image_mode !== "3d" && body.image_mode !== "hybrid")) {
    return [];
  }

  fal.config({ credentials: requireEnv("FAL_KEY") });
  const result = (await fal.subscribe(process.env.FAL_TRELLIS_MODEL ?? "fal-ai/trellis-2", {
    input: {
      image_url: `data:${image.mediaType};base64,${image.base64}`,
      texture_size: "1024"
    },
    logs: false
  })) as {
    data?: { model_glb?: { url?: string }; model_mesh?: { url?: string } };
    model_glb?: { url?: string };
    model_mesh?: { url?: string };
  };
  const url =
    result.data?.model_glb?.url ??
    result.data?.model_mesh?.url ??
    result.model_glb?.url ??
    result.model_mesh?.url;

  if (!url) {
    return [];
  }

  return [
    {
      type: "LOAD_3D_MESH",
      payload: {
        url,
        material: "matte",
        scale: [1, 1, 1],
        position: [0, 0.8, 0]
      }
    } as YiiyaAction
  ];
}

function commandActions(transcript: string): YiiyaAction[] {
  const text = transcript.toLowerCase();

  if (text.includes("reset") || text.includes("new project")) {
    return [{ type: "RESET_PROJECT", payload: {} } as YiiyaAction];
  }

  if (text.includes("publish")) {
    return [{ type: "PUBLISH", payload: {} } as YiiyaAction];
  }

  if (text.includes("redo")) {
    return [{ type: "REDO", payload: {} } as YiiyaAction];
  }

  if (text.includes("undo")) {
    return [{ type: "UNDO", payload: {} } as YiiyaAction];
  }

  if (text.includes("web mode")) {
    return [{ type: "SET_MODE", payload: { mode: "WEB" } } as YiiyaAction];
  }

  if (text.includes("3d mode") || text.includes("three d mode")) {
    return [{ type: "SET_MODE", payload: { mode: "3D" } } as YiiyaAction];
  }

  if (text.includes("hybrid")) {
    return [{ type: "SET_MODE", payload: { mode: "HYBRID" } } as YiiyaAction];
  }

  return [];
}

function compileLocalYiiyaIntent(body: InterpretRequestBody): YiiyaAction[] {
  return compileLocalIntent(body) as YiiyaAction[];
}

function detectBusinessCategory(transcript: string) {
  const text = transcript.toLowerCase();
  const categories = [
    "luxury watch",
    "watch",
    "plumbing",
    "restaurant",
    "photography",
    "studio",
    "dental",
    "law",
    "real estate",
    "salon",
    "gym",
    "fashion",
    "architecture",
    "startup",
    "agency"
  ];

  return categories.find((category) => text.includes(category)) ?? null;
}

export async function classifyIntent(transcript: string): Promise<IntentType> {
  const normalizedTranscript = transcript.toLowerCase();
  const directCommand = commandActions(transcript);

  if (directCommand.length > 0) {
    return "COMMAND";
  }

  if (
    [
      "gold",
      "glass",
      "chrome",
      "sphere",
      "cube",
      "box",
      "blob",
      "mold",
      "mould",
      "mesh",
      "3d",
      "torus",
      "cylinder",
      "helix",
      "bottle",
      "move it left",
      "move it right",
      "move it up",
      "move it down",
      "spin slower",
      "spin faster",
      "organic",
      "glow",
      "dramatic",
      "chaos"
    ].some((term) => normalizedTranscript.includes(term))
  ) {
    return "SPATIAL";
  }

  if (
    ["color", "colour", "font", "spacing", "bigger", "smaller", "center", "align"].some(
      (term) => normalizedTranscript.includes(term)
    )
  ) {
    return "STYLE";
  }

  if (
    /\b(?:change|rename|set)\s+(?:the\s+)?(?:project\s+)?name\s+(?:to|as)\s+/i.test(
      transcript
    ) ||
    /\bcall\s+(?:it|this|the project)\s+/i.test(transcript)
  ) {
    return "STYLE";
  }

  const system =
    "Classify this user command into exactly one word: LAYOUT, SPATIAL, STYLE, COMMAND, or QUESTION. If the prompt is asking to build a website/app but lacks specific details about the industry, target audience, or specific features (e.g., 'make a website', 'build a landing page for my business'), return 'QUESTION'. Return raw JSON string only, e.g. \"QUESTION\".";
  const { text } = await callGemini(
    system,
    transcript,
    fastGeminiModel()
  );
  const parsed = parseJsonFromText(text);

  if (
    parsed === "LAYOUT" ||
    parsed === "SPATIAL" ||
    parsed === "STYLE" ||
    parsed === "COMMAND" ||
    parsed === "QUESTION"
  ) {
    return parsed;
  }

  throw new Error("Conductor returned an invalid intent");
}

async function runResearcher(body: InterpretRequestBody) {
  const category = detectBusinessCategory(body.transcript);

  if (!category) {
    return null;
  }

  const system = `You are Yiiya's Researcher. Return raw JSON only:
{ "industry": string, "audience": string, "offer": string, "usps": string[], "copyAngles": string[], "imageQueries": string[] }.
Use Google Search grounding to make the result specific, realistic, premium, and US-market aware.`;
  const { text, citations } = await callGemini(
    system,
    `Research premium website positioning for: ${body.transcript}`,
    researchGeminiModel(),
    true
  );
  const parsed = parseJsonFromText(text);
  const brief = isRecord(parsed) ? parsed : {};
  const imageQueries = Array.isArray(brief.imageQueries)
    ? brief.imageQueries.filter((item): item is string => typeof item === "string")
    : [`${category} professional photography`];
  const imageUrls = await fetchUnsplashAssets(imageQueries[0] ?? category);

  return {
    industry: typeof brief.industry === "string" ? brief.industry : category,
    audience: typeof brief.audience === "string" ? brief.audience : "premium buyers",
    offer: typeof brief.offer === "string" ? brief.offer : "A focused premium offer",
    usps: Array.isArray(brief.usps)
      ? brief.usps.filter((item): item is string => typeof item === "string")
      : [],
    copyAngles: Array.isArray(brief.copyAngles)
      ? brief.copyAngles.filter((item): item is string => typeof item === "string")
      : [],
    imageQueries,
    imageUrls,
    citations
  } satisfies ResearchBrief;
}

async function fetchUnsplashAssets(query: string) {
  const accessKey = requireEnv("UNSPLASH_ACCESS_KEY");
  const params = new URLSearchParams({
    query,
    per_page: "3",
    orientation: "landscape"
  });
  const response = await fetch(`https://api.unsplash.com/search/photos?${params}`, {
    headers: { Authorization: `Client-ID ${accessKey}` },
    next: { revalidate: 3600 }
  });

  if (!response.ok) {
    return [];
  }

  const data = (await response.json()) as {
    results?: Array<{ urls?: { regular?: string } }>;
  };

  return data.results
    ?.map((result) => result.urls?.regular)
    .filter((url): url is string => Boolean(url))
    .slice(0, 3) ?? [];
}

function coerceCreativeBrief(value: unknown, fallback: CreativeBrief): CreativeBrief {
  if (!isRecord(value)) {
    return fallback;
  }

  return {
    archetype:
      typeof value.archetype === "string"
        ? (value.archetype as CreativeBrief["archetype"])
        : fallback.archetype,
    audience: typeof value.audience === "string" ? value.audience : fallback.audience,
    palette: Array.isArray(value.palette)
      ? value.palette.filter((item): item is string => typeof item === "string").slice(0, 4)
      : fallback.palette,
    visualTone: typeof value.visualTone === "string" ? value.visualTone : fallback.visualTone,
    spatialAssetFamily:
      typeof value.spatialAssetFamily === "string"
        ? (value.spatialAssetFamily as CreativeBrief["spatialAssetFamily"])
        : fallback.spatialAssetFamily,
    confidence:
      typeof value.confidence === "number" ? value.confidence : fallback.confidence,
    fallbackPath:
      value.fallbackPath === "llm" ||
      value.fallbackPath === "heuristic" ||
      value.fallbackPath === "local-compiler"
        ? value.fallbackPath
        : fallback.fallbackPath,
    proofPoints: Array.isArray(value.proofPoints)
      ? value.proofPoints.filter((item): item is string => typeof item === "string")
      : fallback.proofPoints,
    cta: typeof value.cta === "string" ? value.cta : fallback.cta,
    locality: typeof value.locality === "string" ? value.locality : fallback.locality,
    summary: typeof value.summary === "string" ? value.summary : fallback.summary
  };
}

async function runCreativeBrief(
  body: InterpretRequestBody,
  intent: Exclude<IntentType, "QUESTION">,
  researchBrief: ResearchBrief | null
) {
  const heuristic = heuristicCreativeBrief({
    transcript: body.transcript,
    intent,
    creationGoal: body.creationGoal,
    starterPromptId: body.starterPromptId,
    hasReferenceImage: Boolean(body.referenceImage)
  });

  if (!process.env.GEMINI_API_KEY || intent === "COMMAND") {
    return {
      brief: {
        ...heuristic,
        fallbackPath: intent === "COMMAND" ? ("local-compiler" as const) : ("heuristic" as const)
      }
    };
  }

  const system = `You are Yiiya's creative director.
Return raw JSON only matching:
{
  "archetype": "brand-poster" | "service-business" | "creative-portfolio" | "interactive-concept" | "reference-rebuild",
  "audience": string,
  "palette": string[],
  "visualTone": string,
  "spatialAssetFamily": "device" | "bottle" | "vehicle" | "furniture" | "apparel" | "portrait" | "pedestal" | "abstract",
  "confidence": number,
  "fallbackPath": "llm",
  "proofPoints": string[],
  "cta": string,
  "locality": string | null,
  "summary": string
}
Turn rough prompts into something commercially strong and spatially specific.
Do not make the result about Yiiya.`;

  try {
    const { text } = await callGemini(
      system,
      JSON.stringify(
        {
          transcript: body.transcript,
          intent,
          creationGoal: body.creationGoal ?? "web",
          starterPromptId: body.starterPromptId ?? null,
          referenceImage: Boolean(body.referenceImage),
          researchBrief
        },
        null,
        2
      ),
      creativeGeminiModel()
    );
    const parsed = parseJsonFromText(text);

    return {
      brief: coerceCreativeBrief(parsed, {
        ...heuristic,
        fallbackPath: "llm" as const
      })
    };
  } catch {
    return {
      brief: heuristic
    };
  }
}

function presetSpatialAction(transcript: string, brief: CreativeBrief): YiiyaAction | null {
  const text = transcript.toLowerCase();
  const family = inferSpatialAssetFamily(text);
  const color = brief.palette[2] ?? "#EF9F27";
  const material = text.includes("glass")
    ? "glass"
    : text.includes("gold")
      ? "gold"
      : text.includes("chrome")
        ? "chrome"
        : "matte";

  if (family === "device") {
    return {
      type: "ADD_3D_OBJECT",
      payload: {
        prompt: transcript,
        resolvedName: text.includes("phone") ? "phone" : text.includes("watch") ? "watch" : "laptop",
        shape: "device-laptop",
        semanticFamily: family,
        material,
        color,
        animation: "float",
        scale: [1.35, 0.9, 1.05],
        position: [0, 0.85, 0]
      }
    } as YiiyaAction;
  }

  if (family === "vehicle") {
    return {
      type: "ADD_3D_OBJECT",
      payload: {
        prompt: transcript,
        resolvedName: "car",
        shape: "vehicle-sedan",
        semanticFamily: family,
        material,
        color,
        animation: "float",
        scale: [1.3, 0.9, 1.9],
        position: [0, 0.7, 0]
      }
    } as YiiyaAction;
  }

  if (family === "furniture") {
    return {
      type: "ADD_3D_OBJECT",
      payload: {
        prompt: transcript,
        resolvedName: text.includes("table") ? "table" : text.includes("lamp") ? "lamp" : "chair",
        shape: "furniture-chair",
        semanticFamily: family,
        material,
        color,
        animation: "float",
        scale: [1.05, 1.15, 1.05],
        position: [0, 0.8, 0]
      }
    } as YiiyaAction;
  }

  if (family === "apparel") {
    return {
      type: "ADD_3D_OBJECT",
      payload: {
        prompt: transcript,
        resolvedName: text.includes("watch") ? "watch" : text.includes("bag") ? "bag" : "shoe",
        shape: "apparel-shoe",
        semanticFamily: family,
        material,
        color,
        animation: "float",
        scale: [1.18, 0.78, 1.42],
        position: [0, 0.8, 0]
      }
    } as YiiyaAction;
  }

  if (family === "portrait") {
    return {
      type: "ADD_3D_OBJECT",
      payload: {
        prompt: transcript,
        resolvedName: "bust",
        shape: "portrait-bust",
        semanticFamily: family,
        material,
        color,
        animation: "pulse",
        scale: [1.0, 1.3, 1.0],
        position: [0, 0.95, 0]
      }
    } as YiiyaAction;
  }

  if (family === "pedestal") {
    return {
      type: "ADD_3D_OBJECT",
      payload: {
        prompt: transcript,
        resolvedName: "pedestal",
        shape: "pedestal-plinth",
        semanticFamily: family,
        material,
        color,
        animation: "static",
        scale: [1.2, 0.52, 1.2],
        position: [0, 0.45, 0]
      }
    } as YiiyaAction;
  }

  return null;
}

async function runArchitect(
  body: InterpretRequestBody,
  researchBrief: ResearchBrief | null,
  brief: CreativeBrief
) {
  const prompt = body.strategyMode
    ? `${ARCHITECT_PROMPT}\nStrategy mode is enabled: include realistic business rationale in content.strategyNotes fields and strengthen conversion logic.`
    : ARCHITECT_PROMPT;
  const text = await callAnthropic(
    prompt,
    JSON.stringify(
      {
        context: JSON.parse(buildContext(body, researchBrief)),
        creativeBrief: brief
      },
      null,
      2
    ),
    process.env.ANTHROPIC_ARCHITECT_MODEL ?? "claude-3-5-sonnet-20241022",
    2200
  );

  return parseActionArray(text);
}

async function runStyle(body: InterpretRequestBody) {
  const direct = compileLocalYiiyaIntent(body);

  if (
    direct.length > 0 &&
    direct.every((action) =>
      [
        "SET_PROJECT_NAME",
        "MODIFY_ELEMENT",
        "CHANGE_THEME",
        "SET_GLOBAL_THEME",
        "ADJUST_DENSITY"
      ].includes(action.type)
    )
  ) {
    return direct;
  }

  const text = await callAnthropic(
    STYLE_PROMPT,
    buildContext(body, null),
    process.env.ANTHROPIC_CRITIC_MODEL ?? "claude-3-5-haiku-20241022",
    900
  );

  return parseActionArray(text);
}

async function runAlchemist(body: InterpretRequestBody, brief: CreativeBrief) {
  const transcript = body.transcript.toLowerCase();
  const direct = compileLocalYiiyaIntent(body);
  const spatialDirect = direct.filter(
    (action) =>
      action.type === "ADD_3D_OBJECT" ||
      action.type === "SET_MATERIAL" ||
      action.type === "MORPH_BLOB" ||
      action.type === "MOLD_BLOB" ||
      action.type === "SET_BLOB_FORMATION" ||
      action.type === "MOVE_OBJECT" ||
      action.type === "SET_OBJECT_TRANSFORM" ||
      action.type === "SET_OBJECT_ANIMATION" ||
      action.type === "SPAWN_CONTROL" ||
      action.type === "REMOVE_OBJECT"
  );

  if (!body.referenceImage && spatialDirect.length > 0) {
    return spatialDirect;
  }

  if (!body.referenceImage) {
    const preset = presetSpatialAction(transcript, brief);

    if (preset) {
      return [preset];
    }
  }

  if (!body.referenceImage && transcript.includes("gold")) {
    return [
      {
        type: "SET_MATERIAL",
        payload: {
          objectId: "latest",
          material: "gold",
          metalness: 1,
          roughness: 0.2,
          color: "#FFD700"
        }
      } as YiiyaAction
    ];
  }

  const visionActions = body.referenceImage ? await callOpenAIVision(body) : spatialDirect;
  const meshActions = await maybeGenerateTrellisMesh(body);

  return [...visionActions, ...meshActions];
}

async function runCritic(body: InterpretRequestBody, actions: YiiyaAction[]) {
  const text = await callAnthropic(
    CRITIC_PROMPT,
    JSON.stringify({
      transcript: body.transcript,
      selectedElementId: body.activeElementId,
      currentCanvas: body.current_canvas_json ?? body.currentScene,
      actions
    }),
    process.env.ANTHROPIC_CRITIC_MODEL ?? "claude-3-5-haiku-20241022",
    1400
  );

  return parseCritic(text, actions);
}

function modelForIntent(intent: IntentType) {
  if (intent === "LAYOUT") {
    return process.env.ANTHROPIC_ARCHITECT_MODEL ?? "claude-3-5-sonnet-20241022";
  }

  if (intent === "SPATIAL") {
    return bodylessOpenAIModel();
  }

  if (intent === "STYLE") {
    return process.env.ANTHROPIC_CRITIC_MODEL ?? "claude-3-5-haiku-20241022";
  }

  return "deterministic";
}

function bodylessOpenAIModel() {
  return process.env.OPENAI_VISION_MODEL ?? "gpt-4o";
}

async function runActionsForIntent(
  body: InterpretRequestBody,
  intent: IntentType,
  researchBrief: ResearchBrief | null,
  brief: CreativeBrief
) {
  if (intent === "COMMAND") {
    return commandActions(body.transcript);
  }

  if (intent === "SPATIAL") {
    return runAlchemist(body, brief);
  }

  if (intent === "STYLE") {
    return runStyle(body);
  }

  return runArchitect(body, researchBrief, brief);
}

export async function* runInterpretPipeline(
  body: InterpretRequestBody
): AsyncGenerator<PipelineEvent> {
  try {
    const forcedIntent =
      body.image_mode === "web"
        ? "LAYOUT"
        : body.image_mode === "3d"
          ? "SPATIAL"
          : undefined;
    const intent = forcedIntent ?? (await classifyIntent(body.transcript));

    if (intent === "QUESTION") {
      const system = `You are a Copilot for a high-end website generator. The user gave a vague prompt: "${body.transcript}".
Ask exactly one short, targeted clarifying question to gather missing context (like industry, target audience, or specific aesthetic). Return ONLY the question string, nothing else.`;
      const { text } = await callGemini(system, "What should we ask the user?", fastGeminiModel());
      yield {
        type: "router",
        intent,
        model: fastGeminiModel(),
        log: `[ROUTER]: Intent classified as QUESTION → Interview Mode triggered.`,
      };
      yield { type: "question", question: text.replace(/^["']|["']$/g, "") };
      return;
    }

    let researchBrief: ResearchBrief | null = null;
    let researchError: string | null = null;

    if (intent === "LAYOUT") {
      try {
        researchBrief = await runResearcher(body);
      } catch (error) {
        researchError =
          error instanceof Error ? error.message : "Researcher unavailable";
      }
    }

    if (intent === "LAYOUT") {
      yield {
        type: "research",
        brief: researchBrief,
        log: researchError
          ? `[RESEARCH]: Skipped — ${researchError}`
          : researchBrief
          ? `[RESEARCH]: Grounded ${researchBrief.industry} with ${researchBrief.usps.length} USP(s).`
          : "[RESEARCH]: No grounding category detected."
      };
    }

    const { brief } = await runCreativeBrief(body, intent, researchBrief);
    const routerLog = `[ROUTER]: Intent classified as ${intent} → routing to ${modelForIntent(intent)} | brief ${Math.round(brief.confidence * 100)}% ${brief.fallbackPath}.`;

    yield {
      type: "router",
      intent,
      model: modelForIntent(intent),
      log: routerLog,
      brief,
      confidence: brief.confidence,
      fallbackPath: brief.fallbackPath
    };

    if (body.partial) {
      yield {
        type: "done",
        actions: [],
        qa_log: ["[CONDUCTOR]: Speculative pass complete."],
        brief,
        confidence: brief.confidence,
        fallbackPath: brief.fallbackPath
      };
      return;
    }

    const directActions = await runActionsForIntent(body, intent, researchBrief, brief);
    yield { type: "actions", actions: directActions };

    let criticOutput: { actions: YiiyaAction[]; qa_log: string[] } =
      intent === "COMMAND"
        ? { actions: directActions, qa_log: [] }
        : { actions: directActions, qa_log: [] };

    if (intent !== "COMMAND") {
      try {
        criticOutput = await runCritic(body, directActions);
      } catch (criticError) {
        criticOutput = {
          actions: directActions,
          qa_log: [
            "[QA]: Critic unavailable — deterministic action validated.",
            "[SYSTEM]: Syncing 3D light-source to background palette."
          ]
        };
      }
    }

    yield { type: "qa", qa_log: criticOutput.qa_log };
    yield {
      type: "done",
      actions: criticOutput.actions,
      qa_log: criticOutput.qa_log,
      brief,
      confidence: brief.confidence,
      fallbackPath: brief.fallbackPath
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Interpret pipeline failed";
    const fallbackActions = compileLocalYiiyaIntent(body);
    const fallbackBrief = {
      ...heuristicCreativeBrief({
        transcript: body.transcript,
        intent: body.image_mode === "3d" ? "SPATIAL" : "LAYOUT",
        creationGoal: body.creationGoal,
        starterPromptId: body.starterPromptId,
        hasReferenceImage: Boolean(body.referenceImage)
      }),
      fallbackPath: "local-compiler" as const
    };

    if (fallbackActions.length > 0) {
      yield {
        type: "actions",
        actions: fallbackActions,
        log: message.includes("Missing required")
          ? `[INTERPRET]: Deterministic recovery compiler used — ${message}`
          : "[INTERPRET]: Deterministic recovery compiler used."
      };
      yield {
        type: "done",
        actions: fallbackActions,
        qa_log: ["[QA]: Critic skipped — recovery compiler output."],
        brief: fallbackBrief,
        confidence: fallbackBrief.confidence,
        fallbackPath: fallbackBrief.fallbackPath
      };
      return;
    }

    yield { type: "error", message };
  }
}

export async function runInterpretOnce(body: InterpretRequestBody) {
  let actions: YiiyaAction[] = [];
  const qa_log: string[] = [];
  let brief: CreativeBrief | null = null;
  let confidence = 0;
  let fallbackPath: string | null = null;
  const events: PipelineEvent[] = [];

  for await (const event of runInterpretPipeline(body)) {
    events.push(event);

    if (event.type === "router") {
      qa_log.push(event.log);
      brief = event.brief ?? brief;
      confidence = event.confidence ?? confidence;
      fallbackPath = event.fallbackPath ?? fallbackPath;
    }

    if (event.type === "research") {
      qa_log.push(event.log);
    }

    if (event.type === "actions") {
      actions = event.actions;

      if (event.log) {
        qa_log.push(event.log);
      }
    }

    if (event.type === "qa") {
      qa_log.push(...event.qa_log);
    }

    if (event.type === "done") {
      actions = event.actions;
      brief = event.brief ?? brief;
      confidence = event.confidence ?? confidence;
      fallbackPath = event.fallbackPath ?? fallbackPath;
    }

    if (event.type === "error") {
      throw new Error(event.message);
    }
  }

  return { actions, qa_log, events, brief, confidence, fallbackPath };
}
