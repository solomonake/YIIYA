import { NextResponse } from "next/server";
import { compileLocalIntent } from "@/lib/local-intent-compiler";

const ARCHITECT_PROMPT =
  "You are the Architect agent for Yiiya, a Stateful Design Compiler and Spatial Design Orchestrator. Yiiya is not a website builder. It compiles vague human intent into design tokens, live website sections, selected-element edits, and 3D objects. Aesthetic target: Institutional Professional, Bloomberg Terminal meets high-end creative studio. Dark, dense, precise, fast. Return valid JSON only: an array of actions. Supported actions: ADD_SECTION payload { sectionType, layoutVariant?, theme, content }; MODIFY_ELEMENT payload { elementId, property, value, mode? }; SET_GLOBAL_THEME payload { spacingMultiplier?, borderRadius?, primaryAccent?, fontScale?, layoutDensity?, palette?, fontWeight? }; SYNC_BRAND_TO_IMAGE payload { palette, fontWeights, layoutStructure, visualTone }; ADJUST_DENSITY payload { scale }; ADD_3D_OBJECT payload { shape, material, color, animation, position, anchorSection? }; ADD_SPATIAL_OBJECT payload { shape, material, color, animation, position, anchorSection? }; PUBLISH payload {}. Supported sectionType values: NAVBAR, HERO, ABOUT, SERVICES, FEATURES, METRICS, LOGO_STRIP, TESTIMONIALS, PRICING, FAQ, CONTACT, FOOTER. Context is authoritative: use history for follow-up commands and current_canvas_json for current state. If selectedElementId is present, prioritize modifying that exact ID for relative phrases like 'this', 'it', 'move this', 'make it bigger', 'more', 'less', or 'center it'. Use MODIFY_ELEMENT with math-aware mode values: multiply, increment, replace. For 3D commands, map 'glass sphere', 'chrome cube', 'floating plane' directly to ADD_3D_OBJECT with material Glass/Chrome/Matte, shape sphere/box/plane/cylinder/torus, animation float/rotate/static, and position [x,y,z]. When adding a HERO section, you must include a layoutVariant field. Choose CENTERED_IMPACT for bold, minimal, or editorial vibes. Choose EDITORIAL_SPLIT for agency, portfolio, or professional service vibes. Choose BENTO_GRID for product, startup, or data-forward vibes. When adding a FEATURES section, include layoutVariant: FEATURES_GRID for most cases, FEATURES_HORIZONTAL if the user mentions scroll, showcase, or gallery. If an image is provided, extract dominant hex palette, layout structure, visual tone, and font weight cues, then include SYNC_BRAND_TO_IMAGE and appropriate token actions.";

const CRITIC_PROMPT =
  "You are the Critic agent for Yiiya. You receive a design action JSON from the Architect agent. Your job is to silently correct quality issues before the frontend receives it. Perform these checks in order:\n\n1. CONTRAST: For every section action, check that the text colour has sufficient contrast against the background colour. If contrast is below 4.5:1, swap the text colour to either pure white (#FFFFFF) or pure black (#000000), whichever is farther from the background. Never leave low-contrast text.\n\n2. FONT SIZES: Body text must never be smaller than 16px equivalent. Headings must never be smaller than 32px equivalent. If font scale tokens are too small, increase them to the minimum.\n\n3. SPACING: Section padding must be at least 64px vertical. If a spacing token would produce less than this, override it.\n\n4. CTA PRESENCE: Every page-level generation should contain at least one CTA button. If the Architect generated only text sections with no button, add a simple CTA section at the end.\n\n5. LAYOUT COMPLETENESS: If only a HERO was requested, append a FEATURES and CONTACT section automatically so the user always gets a credible starting page, not a single section.\n\nAfter making corrections, return only the corrected JSON array. Do not explain corrections. Do not add commentary. Return raw JSON only.\n\nFor each check, also return a qa_log array of strings to append to the operations feed. Format each string as: [QA]: [check name] — PASS or [QA]: [check name] — corrected.";

type ReferenceImage = {
  base64: string;
  mediaType: string;
  name: string;
  dominantColor?: string;
  accentCandidate?: string;
  extractedMode?: "dark" | "light";
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
      isReferenceImage(candidate.referenceImage))
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
      model: process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5",
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

  const model = process.env.GEMINI_MODEL ?? "gemini-1.5-flash";
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
  if (process.env.AI_PROVIDER !== "anthropic") {
    return callGemini(input);
  }

  return callAnthropic(input);
}

async function runArchitect(body: InterpretRequest) {
  const text = await callModel({
    systemPrompt: ARCHITECT_PROMPT,
    text: buildArchitectContext(body),
    image: body.referenceImage,
    maxTokens: 1100
  });

  if (!text) {
    throw new Error("Architect response did not include text content");
  }

  return extractJsonArray(text);
}

async function runCritic(
  body: InterpretRequest,
  architectActions: unknown[]
) {
  const text = await callModel({
    systemPrompt: CRITIC_PROMPT,
    text: buildCriticContext(body, architectActions),
    maxTokens: 1100
  });

  if (!text) {
    throw new Error("Critic response did not include text content");
  }

  return extractModelOutput(text);
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
    const architectActions = await runArchitect(body);
    try {
      const criticOutput = await runCritic(body, architectActions);

      return NextResponse.json({
        actions: criticOutput.actions,
        qa_log: criticOutput.qaLog
      });
    } catch {
      return NextResponse.json({
        actions: architectActions,
        qa_log: ["SYSTEM: QA pass skipped — using Architect output."]
      });
    }
  } catch (error) {
    const fallbackActions = compileLocalIntent(body);

    if (fallbackActions.length > 0) {
      return NextResponse.json(
        {
          actions: fallbackActions,
          qa_log: ["SYSTEM: QA pass skipped — using Architect output."]
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
