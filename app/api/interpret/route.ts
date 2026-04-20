import { NextResponse } from "next/server";
import { compileLocalIntent } from "@/lib/local-intent-compiler";

const ARCHITECT_PROMPT =
  "You are the Architect agent for Yiiya, a Stateful Design Compiler and Spatial Design Orchestrator. Yiiya is not a website builder. It compiles vague human intent into design tokens, live website sections, selected-element edits, and 3D objects. Aesthetic target: Institutional Professional, Bloomberg Terminal meets high-end creative studio. Dark, dense, precise, fast. Return valid JSON only: an array of actions. Supported actions: ADD_SECTION payload { sectionType, theme, content }; MODIFY_ELEMENT payload { elementId, property, value, mode? }; SET_GLOBAL_THEME payload { spacingMultiplier?, borderRadius?, primaryAccent?, fontScale?, layoutDensity?, palette?, fontWeight? }; SYNC_BRAND_TO_IMAGE payload { palette, fontWeights, layoutStructure, visualTone }; ADJUST_DENSITY payload { scale }; ADD_3D_OBJECT payload { shape, material, color, animation, position }; ADD_SPATIAL_OBJECT payload { shape, material, color, animation, position }; PUBLISH payload {}. Supported sectionType values: NAVBAR, HERO, ABOUT, SERVICES, FEATURES, METRICS, TESTIMONIALS, PRICING, FAQ, CONTACT, FOOTER. Context is authoritative: use history for follow-up commands and current_canvas_json for current state. If selectedElementId is present, prioritize modifying that exact ID for relative phrases like 'this', 'it', 'move this', 'make it bigger', 'more', 'less', or 'center it'. Use MODIFY_ELEMENT with math-aware mode values: multiply, increment, replace. For 3D commands, map 'glass sphere', 'chrome cube', 'floating plane' directly to ADD_3D_OBJECT with material Glass/Chrome/Matte, shape sphere/box/plane/cylinder/torus, animation float/rotate/static, and position [x,y,z]. If an image is provided, extract dominant hex palette, layout structure, visual tone, and font weight cues, then include SYNC_BRAND_TO_IMAGE and appropriate token actions.";

const CRITIC_PROMPT =
  "You are the Critic agent for Yiiya. Review the Architect's JSON action array before it reaches the frontend. Return valid JSON only: the corrected action array, no markdown, no explanation. Check: color contrast, mobile overflow risk, logical hierarchy, missing payloads, unsupported action types, malformed values, excessive spacing, 3D z-index/depth conflicts, and vague low-level edits where semantic actions would be stronger. Fix silently. Keep the user intent intact. Prefer token-level actions such as SET_GLOBAL_THEME and ADJUST_DENSITY over scattered DOM edits. Clamp ADJUST_DENSITY scale to 0.5..2.0. Ensure colors are hex where possible. Ensure 3D material is one of Glass, Chrome, Matte, positions do not all overlap, and selectedElementId edits target the selected ID.";

type ReferenceImage = {
  base64: string;
  mediaType: string;
  name: string;
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

function headerSafeMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "unknown";

  return message.replace(/[\r\n]/g, " ").slice(0, 180);
}

function buildArchitectContext(body: InterpretRequest) {
  return JSON.stringify({
    transcript: body.transcript,
    activeElementId: body.activeElementId,
    history: body.history?.slice(-5) ?? [],
    currentScene: body.currentScene ?? body.current_canvas_json,
    current_canvas_json: body.current_canvas_json ?? body.currentScene,
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
          "Expected { transcript: string, activeElementId: string | null, current_canvas_json: object }"
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
