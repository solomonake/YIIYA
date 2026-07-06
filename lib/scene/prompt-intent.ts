export type PromptSubjectIntent =
  | {
      kind: "object";
      subject: string;
      generationPrompt: string;
    }
  | {
      kind: "typographic";
      subject: string;
      generationPrompt: string;
    };

const TYPOGRAPHIC_RE =
  /\b(?:3d\s*)?(?:text|type|typography|word|words|letter|letters|phrase|caption|signage|wordmark)\b/i;

const OBJECT_COMMAND_RE =
  /^(?:please\s+)?(?:(?:make|create|generate|render|model|build|design|give)\s+(?:me\s+)?(?:a\s+|an\s+|the\s+)?(?:3d\s+)?(?:model\s+of\s+|asset\s+of\s+|object\s+of\s+|image\s+of\s+|preview\s+of\s+)?)/i;

const LEADING_ARTICLE_RE = /^(?:a|an|the)\s+/i;

function cleanSubject(value: string): string {
  return value
    .trim()
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .replace(/[.!?]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractQuotedSubject(prompt: string): string | null {
  const match = prompt.match(/["“”']([^"“”']{1,120})["“”']/);
  return match?.[1] ? cleanSubject(match[1]) : null;
}

function extractTypographicSubject(prompt: string): string {
  const quoted = extractQuotedSubject(prompt);
  if (quoted) return quoted;

  const afterMarker = prompt.match(
    /\b(?:word|words|text|phrase|letters|caption|signage|wordmark)\b(?:\s+(?:that\s+says|saying|reading|spelling|of))?\s+(.+)$/i
  )?.[1];

  if (afterMarker) return cleanSubject(afterMarker);
  return cleanSubject(prompt.replace(TYPOGRAPHIC_RE, ""));
}

function normalizeObjectSubject(prompt: string): string {
  const withoutCommand = prompt.replace(OBJECT_COMMAND_RE, "");
  return cleanSubject(withoutCommand.replace(LEADING_ARTICLE_RE, "")) || cleanSubject(prompt);
}

function withArticle(subject: string): string {
  return /^(?:a|an|the)\s+/i.test(subject)
    ? subject
    : `${/^[aeiou]/i.test(subject) ? "an" : "a"} ${subject}`;
}

export function isExplicitTypographicPrompt(prompt: string): boolean {
  const normalized = prompt.trim();
  if (!normalized) return false;

  return (
    TYPOGRAPHIC_RE.test(normalized) &&
    /\b(?:make|create|generate|render|model|show|write|spell|extrude|3d|three[-\s]?d|word|text|letters|typography|phrase|caption|signage|wordmark)\b/i.test(
      normalized
    )
  );
}

export function classifyPromptSubject(prompt: string): PromptSubjectIntent {
  if (isExplicitTypographicPrompt(prompt)) {
    const subject = extractTypographicSubject(prompt);
    return {
      kind: "typographic",
      subject,
      generationPrompt: `Extruded 3D typography spelling "${subject}". Physical letterforms only.`
    };
  }

  const subject = normalizeObjectSubject(prompt);
  return {
    kind: "object",
    subject,
    generationPrompt: [
      `A physical 3D object of ${withArticle(subject)}.`,
      "Generate the real object, not text, not letters, not typography, not a wordmark.",
      "No printed words, labels, captions, logos, or signage unless explicitly requested."
    ].join(" ")
  };
}

export function objectGenerationPrompt(prompt: string): string {
  return classifyPromptSubject(prompt).generationPrompt;
}
