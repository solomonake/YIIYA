import { NextResponse } from "next/server";

const SYSTEM_PROMPT =
  "You are the AI engine for Yiiya, a voice-first website and 3D creation tool. Yiiya means \"to invent\". Its tagline is \"Say it. See it. Ship it.\" The product is for non-technical builders, indie founders, student creators, and agency creatives who want to speak rough ideas into live websites and 3D scenes. Core values: voice is the interface; vague is valid; 3D is the default, not an add-on; publish immediately. The user will describe what they want in plain, imprecise language. Extract intent aggressively and return a JSON array of actions. Each action has a type and a payload. Supported types: ADD_SECTION (payload: { sectionType, theme, content }), ADD_3D_OBJECT (payload: { shape, color, animation, position }), MODIFY_ELEMENT (payload: { elementId, property, value }), CHANGE_THEME (payload: { property, value }), PUBLISH (payload: {}). Prefer useful defaults for landing pages: HERO, ABOUT, FEATURES, CONTACT. If activeElementId is provided, target MODIFY_ELEMENT at that ID unless the user asks for a broader change. Always return valid JSON only. Never return text or explanation. If you cannot determine the intent, return an empty array. If an image is provided, extract the dominant colour palette (return as hex array), layout structure (e.g. centered hero, two-column, bento grid), and visual tone (e.g. dark minimalist, bright playful). Use these attributes when generating your actions. Apply the extracted palette to the CHANGE_THEME actions.";

type InterpretRequest = {
  transcript: string;
  activeElementId: string | null;
  currentScene: object;
  referenceImage?: {
    base64: string;
    mediaType: string;
    name: string;
  } | null;
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

type AnthropicTextBlock = {
  type: "text";
  text: string;
};

type AnthropicResponse = {
  content?: AnthropicTextBlock[];
};

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
};

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
      (typeof candidate.referenceImage === "object" &&
        typeof candidate.referenceImage.base64 === "string" &&
        typeof candidate.referenceImage.mediaType === "string" &&
        typeof candidate.referenceImage.name === "string"))
  );
}

function extractJsonArray(text: string) {
  const parsed: unknown = JSON.parse(text);

  if (!Array.isArray(parsed)) {
    throw new Error("Claude response was not a JSON array");
  }

  return parsed;
}

function buildPromptBody(body: InterpretRequest) {
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

async function callAnthropic(body: InterpretRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured" },
      { status: 500 }
    );
  }

  const messageContent: AnthropicContentBlock[] = [
    {
      type: "text",
      text: buildPromptBody(body)
    }
  ];

  if (body.referenceImage) {
    messageContent.push({
      type: "image",
      source: {
        type: "base64",
        media_type: body.referenceImage.mediaType,
        data: body.referenceImage.base64
      }
    });
  }

  const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5",
      max_tokens: 900,
      temperature: 0,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: messageContent
        }
      ]
    })
  });

  if (!anthropicResponse.ok) {
    const errorText = await anthropicResponse.text();

    return NextResponse.json(
      { error: "Anthropic request failed", details: errorText },
      { status: anthropicResponse.status }
    );
  }

  const data = (await anthropicResponse.json()) as AnthropicResponse;
  const text = data.content
    ?.filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();

  if (!text) {
    return NextResponse.json(
      { error: "Anthropic response did not include text content" },
      { status: 502 }
    );
  }

  try {
    return NextResponse.json(extractJsonArray(text));
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to parse Anthropic response"
      },
      { status: 502 }
    );
  }
}

async function callGemini(body: InterpretRequest) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not configured" },
      { status: 500 }
    );
  }

  const model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash-lite";
  const parts: Array<
    | { text: string }
    | { inlineData: { mimeType: string; data: string } }
  > = [{ text: buildPromptBody(body) }];

  if (body.referenceImage) {
    parts.push({
      inlineData: {
        mimeType: body.referenceImage.mediaType,
        data: body.referenceImage.base64
      }
    });
  }

  const geminiResponse = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: SYSTEM_PROMPT }]
        },
        contents: [
          {
            role: "user",
            parts
          }
        ],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 900,
          responseMimeType: "application/json"
        }
      })
    }
  );

  if (!geminiResponse.ok) {
    const errorText = await geminiResponse.text();

    return NextResponse.json(
      { error: "Gemini request failed", details: errorText },
      { status: geminiResponse.status }
    );
  }

  const data = (await geminiResponse.json()) as GeminiResponse;
  const text =
    data.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("")
      .trim() ?? "";

  if (!text) {
    return NextResponse.json(
      { error: "Gemini response did not include text content" },
      { status: 502 }
    );
  }

  try {
    return NextResponse.json(extractJsonArray(text));
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to parse Gemini response"
      },
      { status: 502 }
    );
  }
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

  if (process.env.AI_PROVIDER === "gemini") {
    return callGemini(body);
  }

  return callAnthropic(body);
}
