import { NextResponse } from "next/server";
import { compileLocalIntent } from "@/lib/local-intent-compiler";

const ARCHITECT_PROMPT =
  "You are the Architect agent for Yiiya, a Spatial Design Orchestrator. Yiiya is not a website builder. It compiles vague human intent into a tokenized design system, live website sections, and spatial 3D objects. Aesthetic target: Institutional Professional, Bloomberg Terminal meets high-end creative studio. Dark, dense, precise, fast. Return valid JSON only: an array of actions. Supported actions: ADD_SECTION payload { sectionType, theme, content }; MODIFY_ELEMENT payload { elementId, property, value, mode? }; SET_GLOBAL_THEME payload { spacingMultiplier?, borderRadius?, primaryAccent?, fontScale?, layoutDensity?, palette?, fontWeight? }; SYNC_BRAND_TO_IMAGE payload { palette, fontWeights, layoutStructure, visualTone }; ADJUST_DENSITY payload { scale }; ADD_SPATIAL_OBJECT payload { shape, material, color, animation, position }; PUBLISH payload {}. Legacy actions ADD_3D_OBJECT and CHANGE_THEME are allowed only when needed for backward compatibility. If activeElementId is present and the user says relative phrases like 'this', 'a bit bigger', 'make it warmer', target that element with MODIFY_ELEMENT and use mode values like multiply, increment, replace when useful. If an image is provided, extract dominant hex palette, layout structure, visual tone, and font weight cues, then include SYNC_BRAND_TO_IMAGE and appropriate theme actions.";

const CRITIC_PROMPT =
  "You are the Critic agent for Yiiya. Review the Architect's JSON action array before it reaches the frontend. Return valid JSON only: the corrected action array, no markdown, no explanation. Check: color contrast, mobile overflow risk, logical hierarchy, missing payloads, unsupported action types, malformed values, excessive spacing, and vague low-level edits where semantic actions would be stronger. Fix silently. Keep the user intent intact. Prefer token-level actions such as SET_GLOBAL_THEME and ADJUST_DENSITY over scattered DOM edits. Clamp ADJUST_DENSITY scale to 0.5..2.0. Ensure colors are hex where possible. Ensure ADD_SPATIAL_OBJECT material is one of Glass, Chrome, Matte.";

type ReferenceImage = {
  base64: string;
  mediaType: string;
  name: string;
};

type InterpretRequest = {
  transcript: string;
  activeElementId: string | null;
  currentScene: object;
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
    typeof candidate.currentScene === "object" &&
    candidate.currentScene !== null &&
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

function headerSafeMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "unknown";

  return message.replace(/[\r\n]/g, " ").slice(0, 180);
}

function buildArchitectContext(body: InterpretRequest) {
  return JSON.stringify({
    transcript: body.transcript,
    activeElementId: body.activeElementId,
    currentScene: body.currentScene,
    referenceImage: body.referenceImage
      ? {
          name: body.referenceImage.name,
          mediaType: body.referenceImage.mediaType
        }
      : null
  });
}

function buildCriticContext(body: InterpretRequest, architectActions: unknown[]) {
  return JSON.stringify({
    transcript: body.transcript,
    activeElementId: body.activeElementId,
    currentScene: body.currentScene,
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

  const model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash-lite";
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
  if (process.env.AI_PROVIDER === "gemini") {
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

  return extractJsonArray(text);
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
          "Expected { transcript: string, activeElementId: string | null, currentScene: object }"
      },
      { status: 400 }
    );
  }

  try {
    const architectActions = await runArchitect(body);
    const criticActions = await runCritic(body, architectActions);

    return NextResponse.json(criticActions);
  } catch (error) {
    const fallbackActions = compileLocalIntent(body);

    if (fallbackActions.length > 0) {
      return NextResponse.json(fallbackActions, {
        headers: {
          "x-yiiya-interpreter": "local-fallback",
          "x-yiiya-model-error": headerSafeMessage(error)
        }
      });
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
