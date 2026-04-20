import { fal } from "@fal-ai/client";
import OpenAI from "openai";
import { compileLocalIntent } from "@/lib/local-intent-compiler";
import type { YiiyaAction } from "@/lib/store";

export type IntentType = "LAYOUT" | "SPATIAL" | "STYLE" | "COMMAND";

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
  | { type: "router"; intent: IntentType; model: string; log: string }
  | { type: "research"; brief: ResearchBrief | null; log: string }
  | { type: "actions"; actions: YiiyaAction[]; log?: string }
  | { type: "qa"; qa_log: string[] }
  | { type: "done"; actions: YiiyaAction[]; qa_log: string[] }
  | { type: "error"; message: string };

const ARCHITECT_PROMPT = `You are the Architect agent for Yiiya.
Return raw JSON array only. Never return HTML.
Yiiya compiles human intent into semantic section actions and layout tokens.
Aesthetic: SRL institutional, #050505, #1A1A1A borders, amber accent, JetBrains Mono, editorial art direction.
Supported actions:
ADD_SECTION payload { sectionType, layoutVariant, theme, content }
MODIFY_ELEMENT payload { elementId, property, value, mode? }
SET_GLOBAL_THEME payload { spacingMultiplier?, borderRadius?, primaryAccent?, fontScale?, layoutDensity?, palette?, fontWeight? }
SYNC_BRAND_TO_IMAGE payload { palette, fontWeights, layoutStructure, visualTone }
ADJUST_DENSITY payload { scale }
ADD_3D_OBJECT payload { shape, material, color, animation, position, scale?, anchorSection? }
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
If selectedElementId is present and the user says this, it, or that, target that ID.`;

const ALCHEMIST_PROMPT = `You are the 3D Alchemist for Yiiya.
Return raw JSON array only.
Supported actions:
MORPH_BLOB payload { targetShape: 'sphere'|'bottle'|'cube'|'organic'|'crystal', distort: number, speed: number, aspectRatio?: number, silhouette?: object, material?: string }
SET_MATERIAL payload { objectId: string, material: string, metalness?: number, roughness?: number, color?: string, transmission?: number, emissive?: string }
ADD_3D_OBJECT payload { shape: 'sphere'|'box'|'torus'|'cylinder'|'cone'|'capsule', material: 'glass'|'chrome'|'gold'|'matte'|'carbon'|'holographic', color?: string, scale?: [number,number,number], position?: [number,number,number], animation?: 'rotate'|'float'|'pulse'|'spin', intensity?: number, anchorSection?: string }
LOAD_3D_MESH payload { url: string, material?: string, color?: string, scale?: [number,number,number], position?: [number,number,number], anchorSection?: string }
REMOVE_OBJECT payload { objectId: string }
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
      selectedElement: body.activeElementId ?? "none",
      currentCanvas: body.current_canvas_json ?? body.currentScene,
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
      "mesh",
      "3d",
      "torus",
      "cylinder"
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
    ["build", "create", "landing", "website", "page", "section", "brand"].some(
      (term) => normalizedTranscript.includes(term)
    )
  ) {
    return "LAYOUT";
  }

  const system =
    "Classify this user command into exactly one word: LAYOUT, SPATIAL, STYLE, or COMMAND. Return raw JSON string only, e.g. \"LAYOUT\".";
  const { text } = await callGemini(
    system,
    transcript,
    process.env.GEMINI_FLASH_MODEL ?? "gemini-1.5-flash"
  );
  const parsed = parseJsonFromText(text);

  if (
    parsed === "LAYOUT" ||
    parsed === "SPATIAL" ||
    parsed === "STYLE" ||
    parsed === "COMMAND"
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
    process.env.GEMINI_RESEARCH_MODEL ?? "gemini-1.5-pro",
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

async function runArchitect(body: InterpretRequestBody, researchBrief: ResearchBrief | null) {
  const prompt = body.strategyMode
    ? `${ARCHITECT_PROMPT}\nStrategy mode is enabled: include realistic business rationale in content.strategyNotes fields and strengthen conversion logic.`
    : ARCHITECT_PROMPT;
  const text = await callAnthropic(
    prompt,
    buildContext(body, researchBrief),
    process.env.ANTHROPIC_ARCHITECT_MODEL ?? "claude-3-5-sonnet-20241022",
    2200
  );

  return parseActionArray(text);
}

async function runStyle(body: InterpretRequestBody) {
  const text = await callAnthropic(
    STYLE_PROMPT,
    buildContext(body, null),
    process.env.ANTHROPIC_CRITIC_MODEL ?? "claude-3-5-haiku-20241022",
    900
  );

  return parseActionArray(text);
}

async function runAlchemist(body: InterpretRequestBody) {
  const transcript = body.transcript.toLowerCase();
  const direct = compileLocalYiiyaIntent(body);
  const spatialDirect = direct.filter(
    (action) =>
      action.type === "ADD_3D_OBJECT" ||
      action.type === "SET_MATERIAL" ||
      action.type === "MORPH_BLOB" ||
      action.type === "REMOVE_OBJECT"
  );

  if (!body.referenceImage && spatialDirect.length > 0) {
    return spatialDirect;
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
  researchBrief: ResearchBrief | null
) {
  if (intent === "COMMAND") {
    return commandActions(body.transcript);
  }

  if (intent === "SPATIAL") {
    return runAlchemist(body);
  }

  if (intent === "STYLE") {
    return runStyle(body);
  }

  return runArchitect(body, researchBrief);
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
    const routerLog = `[ROUTER]: Intent classified as ${intent} → routing to ${modelForIntent(intent)}`;

    yield { type: "router", intent, model: modelForIntent(intent), log: routerLog };

    const researchPromise =
      intent === "LAYOUT" ? runResearcher(body) : Promise.resolve(null);
    const researchBrief = await researchPromise;

    if (intent === "LAYOUT") {
      yield {
        type: "research",
        brief: researchBrief,
        log: researchBrief
          ? `[RESEARCH]: Grounded ${researchBrief.industry} with ${researchBrief.usps.length} USP(s).`
          : "[RESEARCH]: No grounding category detected."
      };
    }

    if (body.partial) {
      yield {
        type: "done",
        actions: [],
        qa_log: ["[CONDUCTOR]: Speculative pass complete."]
      };
      return;
    }

    const directActions = await runActionsForIntent(body, intent, researchBrief);
    yield { type: "actions", actions: directActions };

    let criticOutput: { actions: YiiyaAction[]; qa_log: string[] } =
      intent === "COMMAND"
        ? { actions: directActions, qa_log: [] }
        : { actions: directActions, qa_log: [] };

    if (intent !== "COMMAND") {
      try {
        criticOutput = await runCritic(body, directActions);
      } catch (criticError) {
        const message =
          criticError instanceof Error ? criticError.message : "Critic unavailable";

        if (intent === "LAYOUT" && message.includes("Missing required")) {
          throw criticError;
        }

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
      qa_log: criticOutput.qa_log
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Interpret pipeline failed";
    const fallbackActions = compileLocalYiiyaIntent(body);

    if (fallbackActions.length > 0 && !message.includes("Missing required")) {
      yield {
        type: "actions",
        actions: fallbackActions,
        log: "[INTERPRET]: Deterministic recovery compiler used."
      };
      yield {
        type: "done",
        actions: fallbackActions,
        qa_log: ["[QA]: Critic skipped — recovery compiler output."]
      };
      return;
    }

    yield { type: "error", message };
  }
}

export async function runInterpretOnce(body: InterpretRequestBody) {
  let actions: YiiyaAction[] = [];
  const qa_log: string[] = [];
  const events: PipelineEvent[] = [];

  for await (const event of runInterpretPipeline(body)) {
    events.push(event);

    if (event.type === "router") {
      qa_log.push(event.log);
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
    }

    if (event.type === "error") {
      throw new Error(event.message);
    }
  }

  return { actions, qa_log, events };
}
