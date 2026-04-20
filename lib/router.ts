export type IntentType = "LAYOUT" | "SPATIAL" | "STYLE" | "COMMAND";

const ROUTER_PROMPT =
  "Classify this user command into exactly one word: LAYOUT (building sections, pages, content), SPATIAL (3D objects, shapes, materials, blob), STYLE (colours, fonts, spacing, theme changes), or COMMAND (reset, publish, undo, mode switch). Return only the single word, nothing else.";

type GeminiRouterResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
};

type AnthropicRouterResponse = {
  content?: Array<{
    type: "text";
    text: string;
  }>;
};

function normalizeIntent(value: string): IntentType {
  const normalized = value.trim().toUpperCase();

  if (
    normalized === "LAYOUT" ||
    normalized === "SPATIAL" ||
    normalized === "STYLE" ||
    normalized === "COMMAND"
  ) {
    return normalized;
  }

  throw new Error(`Unknown intent classification: ${value}`);
}

async function classifyWithGemini(transcript: string) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: ROUTER_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: transcript }] }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 8
        }
      })
    }
  );

  if (!response.ok) {
    throw new Error(`Gemini router failed: ${await response.text()}`);
  }

  const data = (await response.json()) as GeminiRouterResponse;
  const text =
    data.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("")
      .trim() ?? "";

  return normalizeIntent(text);
}

async function classifyWithAnthropic(transcript: string) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 8,
      temperature: 0,
      system: ROUTER_PROMPT,
      messages: [{ role: "user", content: transcript }]
    })
  });

  if (!response.ok) {
    throw new Error(`Anthropic router failed: ${await response.text()}`);
  }

  const data = (await response.json()) as AnthropicRouterResponse;
  const text =
    data.content
      ?.filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim() ?? "";

  return normalizeIntent(text);
}

export async function classifyIntent(transcript: string): Promise<IntentType> {
  if (process.env.GEMINI_API_KEY) {
    return classifyWithGemini(transcript);
  }

  return classifyWithAnthropic(transcript);
}
