import { NextResponse } from "next/server";
import { compileLocalIntent } from "@/lib/local-intent-compiler";
import { ALCHEMIST_PROMPT } from "@/lib/prompts/alchemist";
import { classifyIntent, type IntentType } from "@/lib/router";

const ARCHITECT_PROMPT =
  "You are the Architect agent for Yiiya, a Stateful Design Compiler and Spatial Design Orchestrator. Yiiya is not a website builder. It compiles vague human intent into design tokens, live website sections, selected-element edits, and 3D objects. Aesthetic target: Institutional Professional, Bloomberg Terminal meets high-end creative studio. Dark, dense, precise, fast. Return valid JSON only: an array of actions. Supported actions: ADD_SECTION payload { sectionType, layoutVariant?, theme, content }; MODIFY_ELEMENT payload { elementId, property, value, mode? }; SET_GLOBAL_THEME payload { spacingMultiplier?, borderRadius?, primaryAccent?, fontScale?, layoutDensity?, palette?, fontWeight? }; SYNC_BRAND_TO_IMAGE payload { palette, fontWeights, layoutStructure, visualTone }; ADJUST_DENSITY payload { scale }; ADD_3D_OBJECT payload { shape, material, color, animation, position, anchorSection? }; ADD_SPATIAL_OBJECT payload { shape, material, color, animation, position, anchorSection? }; PUBLISH payload {}. Supported sectionType values: NAVBAR, HERO, ABOUT, SERVICES, FEATURES, METRICS, LOGO_STRIP, TESTIMONIALS, PRICING, FAQ, CONTACT, FOOTER. Context is authoritative: use history for follow-up commands and current_canvas_json for current state. If selectedElementId is present, prioritize modifying that exact ID for relative phrases like 'this', 'it', 'move this', 'make it bigger', 'more', 'less', or 'center it'. Use MODIFY_ELEMENT with math-aware mode values: multiply, increment, replace. For 3D commands, map 'glass sphere', 'chrome cube', 'floating plane' directly to ADD_3D_OBJECT with material Glass/Chrome/Matte, shape sphere/box/plane/cylinder/torus, animation float/rotate/static, and position [x,y,z]. When adding a HERO section, you must include a layoutVariant field. Choose CENTERED_IMPACT for bold, minimal, or editorial vibes. Choose EDITORIAL_SPLIT for agency, portfolio, or professional service vibes. Choose BENTO_GRID for product, startup, or data-forward vibes. When adding a FEATURES section, include layoutVariant: FEATURES_GRID for most cases, FEATURES_HORIZONTAL if the user mentions scroll, showcase, or gallery. If an image is provided, extract dominant hex palette, layout structure, visual tone, and font weight cues, then include SYNC_BRAND_TO_IMAGE and appropriate token actions.";

const CRITIC_PROMPT =
  "You are the Critic agent for Yiiya. You receive design action JSON. Silently correct these issues and return only the corrected JSON array plus a qa_log string array.\n\nCHECK 1 CONTRAST: For every section, if text colour and background colour would produce contrast below 4.5:1, swap text to #FFFFFF or #000000 whichever is farther from the background.\nCHECK 2 TYPOGRAPHY: Body text fontSize minimum 16. Headings minimum 32. Correct silently if violated.\nCHECK 3 SPACING: Section vertical padding minimum 64px. Correct if lower.\nCHECK 4 COMPLETENESS: If only one section was generated and no CTA exists, append a minimal CONTACT section.\nCHECK 5 3D LIGHTING: If any ADD_3D_OBJECT action exists with material glass or holographic, ensure the scene has at least one pointLight action. Add one if missing.\n\nReturn format: { actions: [...corrected actions], qa_log: ['[QA]: check — PASS/corrected'] }\nReturn raw JSON only. No explanation.";

const STYLE_PROMPT =
  "You are the Style agent for Yiiya. Return raw JSON array only. Handle only colour, font, spacing, density, and theme requests. Supported actions: SET_GLOBAL_THEME payload { spacingMultiplier?, borderRadius?, primaryAccent?, fontScale?, layoutDensity?, palette?, fontWeight? }; CHANGE_THEME payload { property, value }; ADJUST_DENSITY payload { scale }; MODIFY_ELEMENT payload { elementId, property, value, mode? }. If selectedElementId is present and the user says this, it, or that, target that exact elementId.";

type ReferenceImage = {
  base64: string;
  mediaType: string;
  name: string;
  dominantColor?: string;
  accentCandidate?: string;
  extractedMode?: "dark" | "light";
  imageMode?: "web" | "3d" | "hybrid";
};

type InterpretRequest = {
  transcript: string;
  activeElementId: string | null;
  currentScene?: object;
  current_canvas_json?: object;
  history?: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
  referenceImage?: ReferenceImage | null;
  image_mode?: "web" | "3d" | "hybrid";
};

type AnthropicContentBlock =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "image";
      source: {
        type: "base64";
        media_type: string;
        data: string;
      };
    };

type AnthropicResponse = {
  content?: Array<{
    type: "text";
    text: string;
  }>;
};

type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
};

type ModelInput = {
  systemPrompt: string;
  text: string;
  image?: ReferenceImage | null;
  maxTokens?: number;
  provider?: "anthropic" | "gemini";
  model?: string;
};

type GroundingContext = {
  industry: string;
  city: string;
  promptBlock: string;
  log: string;
};

function isReferenceImage(value: unknown): value is ReferenceImage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ReferenceImage>;

  return (
    typeof candidate.base64 === "string" &&
    typeof candidate.mediaType === "string" &&
    typeof candidate.name === "string"
  );
}

function isInterpretRequest(value: unknown): value is InterpretRequest {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<InterpretRequest>;

  return (
    typeof candidate.transcript === "string" &&
    (typeof candidate.activeElementId === "string" ||
      candidate.activeElementId === null) &&
    (candidate.currentScene === undefined ||
      (typeof candidate.currentScene === "object" &&
        candidate.currentScene !== null)) &&
    (candidate.current_canvas_json === undefined ||
      (typeof candidate.current_canvas_json === "object" &&
        candidate.current_canvas_json !== null)) &&
    (Boolean(candidate.currentScene) || Boolean(candidate.current_canvas_json)) &&
    (candidate.history === undefined ||
      (Array.isArray(candidate.history) &&
        candidate.history.every((message) => {
          if (!message || typeof message !== "object") {
            return false;
          }

          const candidateMessage = message as {
            role?: unknown;
            content?: unknown;
          };

          return (
            (candidateMessage.role === "user" ||
              candidateMessage.role === "assistant") &&
            typeof candidateMessage.content === "string"
          );
        }))) &&
    (candidate.referenceImage === undefined ||
      candidate.referenceImage === null ||
      isReferenceImage(candidate.referenceImage)) &&
    (candidate.image_mode === undefined ||
      candidate.image_mode === "web" ||
      candidate.image_mode === "3d" ||
      candidate.image_mode === "hybrid")
  );
}

function extractJsonArray(text: string) {
  const trimmed = text.trim();
  const parsed: unknown = JSON.parse(trimmed);

  if (!Array.isArray(parsed)) {
    throw new Error("Model response was not a JSON array");
  }

  return parsed;
}

function extractModelOutput(text: string) {
  const trimmed = text.trim();
  const parsed: unknown = JSON.parse(trimmed);

  if (Array.isArray(parsed)) {
    return { actions: parsed, qaLog: [] };
  }

  if (parsed && typeof parsed === "object") {
    const record = parsed as { actions?: unknown; qa_log?: unknown };

    if (Array.isArray(record.actions)) {
      return {
        actions: record.actions,
        qaLog: Array.isArray(record.qa_log)
          ? record.qa_log.filter((item): item is string => typeof item === "string")
          : []
      };
    }
  }

  throw new Error("Model response was not a JSON action array");
}

function headerSafeMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "unknown";

  return message.replace(/[\r\n]/g, " ").slice(0, 180);
}

function modelForIntent(intent: IntentType) {
  if (intent === "LAYOUT" || intent === "SPATIAL") {
    return "claude-sonnet-4-6";
  }

  if (intent === "STYLE") {
    return "claude-haiku-4-5-20251001";
  }

  return "deterministic";
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  return Promise.race([
    promise,
    new Promise<T>((_resolve, reject) => {
      setTimeout(() => reject(new Error(message)), timeoutMs);
    })
  ]);
}

function commandActions(transcript: string) {
  const text = transcript.toLowerCase();

  if (text.includes("reset") || text.includes("new")) {
    return [{ type: "RESET_PROJECT", payload: {} }];
  }

  if (text.includes("publish")) {
    return [{ type: "PUBLISH", payload: {} }];
  }

  if (text.includes("undo")) {
    return [{ type: "UNDO", payload: {} }];
  }

  if (text.includes("web mode")) {
    return [{ type: "SET_MODE", payload: { mode: "WEB" } }];
  }

  if (text.includes("3d mode") || text.includes("three d mode")) {
    return [{ type: "SET_MODE", payload: { mode: "3D" } }];
  }

  if (text.includes("hybrid")) {
    return [{ type: "SET_MODE", payload: { mode: "HYBRID" } }];
  }

  return [];
}

function detectIndustry(transcript: string) {
  const industries = [
    "plumbing",
    "restaurant",
    "photography",
    "gym",
    "law",
    "dental",
    "real estate",
    "fashion",
    "cafe",
    "salon",
    "agency",
    "studio",
    "startup",
    "portfolio",
    "tech",
    "music",
    "architecture",
    "wedding"
  ];
  const text = transcript.toLowerCase();

  return industries.find((industry) => text.includes(industry)) ?? null;
}

function detectCity(transcript: string) {
  const match = transcript.match(/\bin\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/);

  return match?.[1] ?? "a major city";
}

async function fetchUnsplashImages(industry: string) {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY;

  if (!accessKey) {
    return [];
  }

  const params = new URLSearchParams({
    query: `${industry} professional photography`,
    per_page: "3",
    orientation: "landscape"
  });
  const response = await fetch(`https://api.unsplash.com/search/photos?${params}`, {
    headers: {
      Authorization: `Client-ID ${accessKey}`
    },
    next: { revalidate: 3600 }
  });

  if (!response.ok) {
    return [];
  }

  const data = (await response.json()) as {
    results?: Array<{ urls?: { regular?: string } }>;
  };

  return (
    data.results
      ?.map((result) => result.urls?.regular)
      .filter((url): url is string => Boolean(url))
      .slice(0, 3) ?? []
  );
}

async function buildGroundingContext(transcript: string): Promise<GroundingContext | null> {
  const industry = detectIndustry(transcript);

  if (!industry) {
    return null;
  }

  const city = detectCity(transcript);
  const imageUrls = await fetchUnsplashImages(industry);
  const imageInstruction =
    imageUrls.length > 0
      ? `\nUse these real image URLs in the generated sections where images are needed: ${imageUrls.join(", ")}.`
      : "\nNo real image URLs are available. Generate descriptive alt text and set a background colour instead. Never use placeholder image services.";

  return {
    industry,
    city,
    log: `[GROUNDING]: Industry detected: ${industry} — enriching with real content`,
    promptBlock: `\nThe user is building a site for: ${industry}. Generate content that is realistic and specific to this industry. Use real-sounding business names, actual service descriptions, realistic pricing if applicable, and industry-appropriate copy. Do not use placeholder text like 'Lorem ipsum' or 'Company Name'. Generate content as if this is a real business in ${city}.${imageInstruction}`
  };
}

function buildHistoryContext(history: InterpretRequest["history"]) {
  return (history ?? [])
    .slice(-3)
    .map((turn) => `[${turn.role}]: ${turn.content}`)
    .join("\n");
}

function buildReferenceExtractionContext(referenceImage: ReferenceImage | null | undefined) {
  if (
    !referenceImage?.dominantColor ||
    !referenceImage.accentCandidate ||
    !referenceImage.extractedMode
  ) {
    return "";
  }

  return `\nThe user dropped a reference image. Local extraction found: dominant colour ${referenceImage.dominantColor}, accent colour ${referenceImage.accentCandidate}, mode ${referenceImage.extractedMode}. Honour these values in all CHANGE_THEME and ADD_SECTION actions. Do not override the extracted palette with generic colours.`;
}

function buildArchitectContext(body: InterpretRequest) {
  return `Previous context:
${buildHistoryContext(body.history)}

Current command: ${body.transcript}
Selected element: ${body.activeElementId ?? "none"}

current_canvas_json:
${JSON.stringify(body.current_canvas_json ?? body.currentScene)}
image_mode: ${body.image_mode ?? body.referenceImage?.imageMode ?? "none"}
${buildReferenceExtractionContext(body.referenceImage)}`;
}

function buildCriticContext(body: InterpretRequest, architectActions: unknown[]) {
  return JSON.stringify({
    transcript: body.transcript,
    activeElementId: body.activeElementId,
    history: body.history?.slice(-5) ?? [],
    currentScene: body.currentScene ?? body.current_canvas_json,
    current_canvas_json: body.current_canvas_json ?? body.currentScene,
    architectActions
  });
}

async function callAnthropic(input: ModelInput) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }

  const content: AnthropicContentBlock[] = [
    {
      type: "text",
      text: input.text
    }
  ];

  if (input.image) {
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: input.image.mediaType,
        data: input.image.base64
      }
    });
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: input.model ?? process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5",
      max_tokens: input.maxTokens ?? 1000,
      temperature: 0,
      system: input.systemPrompt,
      messages: [
        {
          role: "user",
          content
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`Anthropic request failed: ${await response.text()}`);
  }

  const data = (await response.json()) as AnthropicResponse;

  return (
    data.content
      ?.filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim() ?? ""
  );
}

async function callGemini(input: ModelInput) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const model = input.model ?? process.env.GEMINI_MODEL ?? "gemini-1.5-flash";
  const parts: GeminiPart[] = [{ text: input.text }];

  if (input.image) {
    parts.push({
      inlineData: {
        mimeType: input.image.mediaType,
        data: input.image.base64
      }
    });
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: input.systemPrompt }]
        },
        contents: [
          {
            role: "user",
            parts
          }
        ],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: input.maxTokens ?? 1000,
          responseMimeType: "application/json"
        }
      })
    }
  );

  if (!response.ok) {
    throw new Error(`Gemini request failed: ${await response.text()}`);
  }

  const data = (await response.json()) as GeminiResponse;

  return (
    data.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("")
      .trim() ?? ""
  );
}

async function callModel(input: ModelInput) {
  if (input.provider === "anthropic") {
    return callAnthropic(input);
  }

  if (input.provider === "gemini") {
    return callGemini(input);
  }

  if (process.env.AI_PROVIDER !== "anthropic") {
    return callGemini(input);
  }

  return callAnthropic(input);
}

async function runArchitect(body: InterpretRequest, extraPrompt = "") {
  const text = await callAnthropic({
    systemPrompt: `${ARCHITECT_PROMPT}${extraPrompt}`,
    text: buildArchitectContext(body),
    image: body.referenceImage,
    maxTokens: 1600,
    model: "claude-sonnet-4-6"
  });

  if (!text) {
    throw new Error("Architect response did not include text content");
  }

  return extractJsonArray(text);
}

async function runSpatial(body: InterpretRequest) {
  const imageInstruction =
    body.image_mode === "3d" || body.referenceImage?.imageMode === "3d"
      ? "\nAn image has been uploaded. Analyze its primary subject. Determine the closest 3D primitive (sphere for round objects, box for rectangular objects, cylinder for tall/bottle objects, torus for ring-shaped objects). Return a MORPH_BLOB action to reshape the blob toward that primitive, plus a SET_MATERIAL action matching the object's apparent material. The user will then refine by voice."
      : "";
  const text = await callAnthropic({
    systemPrompt: `${ALCHEMIST_PROMPT}${imageInstruction}`,
    text: buildArchitectContext(body),
    image: body.referenceImage,
    maxTokens: 1000,
    model: "claude-sonnet-4-6"
  });

  if (!text) {
    throw new Error("Alchemist response did not include text content");
  }

  return extractJsonArray(text);
}

async function runStyle(body: InterpretRequest) {
  const text = await callAnthropic({
    systemPrompt: STYLE_PROMPT,
    text: buildArchitectContext(body),
    maxTokens: 800,
    model: "claude-haiku-4-5-20251001"
  });

  if (!text) {
    throw new Error("Style response did not include text content");
  }

  return extractJsonArray(text);
}

async function runCritic(
  body: InterpretRequest,
  architectActions: unknown[]
) {
  const text = await callAnthropic({
    systemPrompt: CRITIC_PROMPT,
    text: buildCriticContext(body, architectActions),
    maxTokens: 1100,
    model: "claude-haiku-4-5-20251001"
  });

  if (!text) {
    throw new Error("Critic response did not include text content");
  }

  return extractModelOutput(text);
}

async function runCriticOrDirect(body: InterpretRequest, actions: unknown[]) {
  try {
    return await withTimeout(
      runCritic(body, actions),
      1500,
      "Critic timed out"
    );
  } catch {
    return {
      actions,
      qaLog: ["[QA]: Critic skipped — using direct output."]
    };
  }
}

async function runSingleModelFallback(body: InterpretRequest) {
  const architectActions = await runArchitect(body);

  try {
    const criticOutput = await runCritic(body, architectActions);

    return {
      actions: criticOutput.actions,
      qaLog: criticOutput.qaLog
    };
  } catch {
    return {
      actions: architectActions,
      qaLog: ["[QA]: Critic skipped — using direct output."]
    };
  }
}

async function runRoutedModel(
  body: InterpretRequest,
  intent: IntentType,
  groundingContext?: GroundingContext | null
) {
  if (intent === "COMMAND") {
    return commandActions(body.transcript);
  }

  if (intent === "SPATIAL") {
    return runSpatial(body);
  }

  if (intent === "STYLE") {
    return runStyle(body);
  }

  return runArchitect(body, groundingContext?.promptBlock ?? "");
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isInterpretRequest(body) || body.transcript.trim().length === 0) {
    return NextResponse.json(
      {
        error:
          "Expected { transcript: string, activeElementId: string | null, current_canvas_json: object }"
      },
      { status: 400 }
    );
  }

  try {
    try {
      const forcedIntent =
        body.image_mode === "web"
          ? "LAYOUT"
          : body.image_mode === "3d"
            ? "SPATIAL"
            : undefined;
      const intent =
        forcedIntent ??
        (await withTimeout(
          classifyIntent(body.transcript),
          800,
          "Intent router timed out"
        ));
      const model = modelForIntent(intent);
      const routerLog = `[ROUTER]: Intent classified as ${intent} → routing to ${model}`;
      const groundingContext =
        intent === "LAYOUT" ? await buildGroundingContext(body.transcript) : null;
      const directActions = await runRoutedModel(body, intent, groundingContext);
      const criticOutput =
        intent === "COMMAND"
          ? { actions: directActions, qaLog: [] }
          : await runCriticOrDirect(body, directActions);

      return NextResponse.json({
        actions: criticOutput.actions,
        qa_log: (groundingContext
          ? [routerLog, groundingContext.log]
          : [routerLog]
        ).concat(criticOutput.qaLog)
      });
    } catch {
      const fallbackOutput = await runSingleModelFallback(body);

      return NextResponse.json({
        actions: fallbackOutput.actions,
        qa_log: fallbackOutput.qaLog
      });
    }
  } catch (error) {
    const fallbackActions = compileLocalIntent(body);

    if (fallbackActions.length > 0) {
      return NextResponse.json(
        {
          actions: fallbackActions,
          qa_log: ["[QA]: Critic skipped — using direct output."]
        },
        {
        headers: {
          "x-yiiya-interpreter": "local-fallback",
          "x-yiiya-model-error": headerSafeMessage(error)
        }
        }
      );
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Interpret pipeline failed"
      },
      { status: 502 }
    );
  }
}
