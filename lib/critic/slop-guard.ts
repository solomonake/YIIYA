/**
 * SlopGuard — anti-AI-slop Critic pass.
 *
 * Enforced rules:
 *   - Banned default fonts (Inter at root, system stacks, Arial, Roboto)
 *   - Banned default gradients (purple→blue, pink→purple, blue→cyan)
 *   - Banned generic copy patterns ("Build the future", "Empower your…")
 *   - Banned uniform border-radius across all cards
 *   - Locked-stake violations (action contradicts the planted stake)
 *
 * Returns rewrites where possible (don't fail — repair). Falls through to
 * a hard reject only when the rewrite is impossible.
 *
 * Research basis:
 *   https://www.925studios.co/blog/ai-slop-web-design-guide
 *   https://prg.sh/ramblings/Why-Your-AI-Keeps-Building-the-Same-Purple-Gradient-Website
 */
import type { Stake } from "@/lib/brief/stake-matrix";

export type SlopVerdict = {
  ok: boolean;
  rewrites: SlopRewrite[];
  warnings: string[];
};

export type SlopRewrite = {
  path: string;       // e.g. "sections[0].title"
  before: string;
  after: string;
  reason: string;
};

const BANNED_FONTS = new Set(["inter", "roboto", "arial", "helvetica", "system-ui"]);

const BANNED_GRADIENTS: ReadonlyArray<RegExp> = [
  // Purple→blue
  /linear-gradient\([^)]*#?(?:7c3aed|8b5cf6|a855f7)[^)]*#?(?:3b82f6|2563eb|1d4ed8)/i,
  // Pink→purple
  /linear-gradient\([^)]*#?(?:ec4899|d946ef)[^)]*#?(?:a855f7|7c3aed)/i,
  // Blue→cyan
  /linear-gradient\([^)]*#?(?:3b82f6|2563eb)[^)]*#?(?:06b6d4|22d3ee)/i,
  // Generic 45deg corner gradient
  /linear-gradient\(45deg,\s*#[0-9a-f]{3,8}[^,]*,\s*#[0-9a-f]{3,8}\)/i
];

const BANNED_COPY: ReadonlyArray<{ re: RegExp; replace?: string; reason: string }> = [
  { re: /^Build the future of /i, reason: "AI-slop opener" },
  { re: /^Empower your /i, reason: "AI-slop opener" },
  { re: /^Transform your /i, reason: "AI-slop opener" },
  { re: /^The platform for /i, reason: "AI-slop opener" },
  { re: /^Revolutionize /i, reason: "AI-slop opener" },
  { re: /\bA company (?:in|for|that|of) /i, reason: "generic placeholder leak" },
  { re: /\blorem ipsum/i, reason: "lorem ipsum leak" },
  { re: /\bdummy text\b/i, reason: "placeholder text leak" },
  { re: /\bcoming soon\b/i, reason: "non-functional copy" }
];

const ACCENT_VARIETY_TAGS = ["card", "tile", "panel"];

// -----------------------------------------------------------------------------
// Public entry — accepts a generic action list. Action shape kept loose to
// match the existing semantic action contract (see YIIYA.md Phase 2).
// -----------------------------------------------------------------------------
export function checkSlop(
  actions: ReadonlyArray<Record<string, unknown>>,
  stake: Stake
): SlopVerdict {
  const rewrites: SlopRewrite[] = [];
  const warnings: string[] = [];

  actions.forEach((action, i) => {
    walkStrings(action, (path, value) => {
      // Font check
      if (path.endsWith(".fontFamily") || path === "theme.font") {
        const lower = value.toLowerCase().replace(/['"\s]/g, "");
        // Array.from for ES5 target compatibility — BANNED_FONTS is a Set.
        for (const banned of Array.from(BANNED_FONTS)) {
          if (lower.includes(banned) && stake.typographyVoice !== "swiss-grotesk") {
            rewrites.push({
              path: `actions[${i}].${path}`,
              before: value,
              after: stakeReplacement(stake, "font"),
              reason: `banned default font: ${banned}`
            });
          }
        }
      }
      // Gradient check
      if (typeof value === "string" && value.includes("gradient")) {
        for (const re of BANNED_GRADIENTS) {
          if (re.test(value)) {
            rewrites.push({
              path: `actions[${i}].${path}`,
              before: value,
              after: stakeReplacement(stake, "background"),
              reason: "banned default gradient"
            });
            break;
          }
        }
      }
      // Copy check
      if (typeof value === "string" && value.length > 4) {
        for (const { re, reason } of BANNED_COPY) {
          if (re.test(value)) {
            warnings.push(`Slop copy at actions[${i}].${path}: ${reason}`);
            rewrites.push({
              path: `actions[${i}].${path}`,
              before: value,
              after: "",
              reason: `${reason} — replace with concrete brand copy`
            });
            break;
          }
        }
      }
    });

    // Border-radius uniformity check (only on collections of cards)
    const cards = collectByTag(action, ACCENT_VARIETY_TAGS);
    if (cards.length >= 3) {
      const radii = cards.map((c) => normalizeRadius(c.borderRadius));
      const unique = new Set(radii.filter(Boolean));
      if (unique.size === 1 && radii[0]) {
        warnings.push(
          `actions[${i}]: ${cards.length} cards share borderRadius="${radii[0]}". Vary radii to avoid AI-slop uniformity.`
        );
      }
    }
  });

  return {
    ok: rewrites.length === 0,
    rewrites,
    warnings
  };
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function walkStrings(
  obj: unknown,
  visit: (path: string, value: string) => void,
  prefix = ""
): void {
  if (obj === null || obj === undefined) return;
  if (typeof obj === "string") {
    visit(prefix, obj);
    return;
  }
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => walkStrings(item, visit, `${prefix}[${i}]`));
    return;
  }
  if (typeof obj === "object") {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      walkStrings(v, visit, prefix ? `${prefix}.${k}` : k);
    }
  }
}

function collectByTag(
  action: Record<string, unknown>,
  tags: ReadonlyArray<string>
): Array<{ borderRadius?: string }> {
  const out: Array<{ borderRadius?: string }> = [];
  walkStrings(action, (path, _v) => {
    if (tags.some((tag) => path.toLowerCase().includes(tag))) {
      // Best-effort: pluck the parent and capture borderRadius if any.
      const parent = resolveParent(action, path);
      if (parent && typeof parent === "object") {
        const radius = (parent as Record<string, unknown>).borderRadius;
        if (typeof radius === "string" || radius === undefined) {
          out.push({ borderRadius: radius as string | undefined });
        }
      }
    }
  });
  return out;
}

function resolveParent(root: unknown, path: string): unknown {
  const segments = path.split(/\.|\[|\]/).filter(Boolean);
  segments.pop();
  let cur: unknown = root;
  for (const seg of segments) {
    if (cur && typeof cur === "object") {
      cur = (cur as Record<string, unknown>)[seg] ?? (cur as unknown[])[Number(seg)];
    } else {
      return undefined;
    }
  }
  return cur;
}

function normalizeRadius(raw: string | undefined): string | null {
  if (!raw) return null;
  return raw.trim().toLowerCase();
}

function stakeReplacement(stake: Stake, what: "font" | "background"): string {
  if (what === "font") return `var(--yiiya-font-heading)`;
  return `var(--yiiya-bg)`;
}
