/**
 * A11yGuard — accessibility Critic pass.
 *
 * Enforced rules:
 *   - WCAG 2.1 AA contrast (4.5:1 for body text, 3:1 for large text)
 *   - Single <h1> per page; no skipped heading levels
 *   - All <img>-equivalents carry alt text
 *   - All interactive elements have an accessible name
 *   - Page declares a language
 *
 * Returns fixes (alt text generation suggestions, contrast-darkening deltas)
 * the Architect or the action runner can apply.
 *
 * Contrast formula: WCAG 2.x relative luminance.
 *   https://www.w3.org/WAI/GL/wiki/Relative_luminance
 */
export type A11yIssue = {
  severity: "error" | "warn";
  rule: "contrast" | "heading-order" | "missing-alt" | "missing-label" | "missing-lang";
  path: string;
  message: string;
  fix?: string;
};

export type A11yReport = {
  ok: boolean;
  issues: A11yIssue[];
  score: number; // 0..100
};

// -----------------------------------------------------------------------------
// Contrast
// -----------------------------------------------------------------------------

function hexToRgb(hex: string): [number, number, number] | null {
  const m = hex.replace("#", "").match(/^([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  const v = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  return [
    parseInt(v.slice(0, 2), 16),
    parseInt(v.slice(2, 4), 16),
    parseInt(v.slice(4, 6), 16)
  ];
}

function relLuminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(fgHex: string, bgHex: string): number | null {
  const fg = hexToRgb(fgHex);
  const bg = hexToRgb(bgHex);
  if (!fg || !bg) return null;
  const l1 = relLuminance(fg);
  const l2 = relLuminance(bg);
  const [lighter, darker] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Darken a foreground color until contrast meets `target` against bg.
 * Returns the adjusted hex (or original if already passing / no fix found).
 */
export function adjustForContrast(fgHex: string, bgHex: string, target = 4.5): string {
  const cur = contrastRatio(fgHex, bgHex);
  if (cur === null || cur >= target) return fgHex;
  const rgb = hexToRgb(fgHex);
  if (!rgb) return fgHex;
  const bgLum = relLuminance(hexToRgb(bgHex) ?? [255, 255, 255]);
  // Decide direction: push fg away from bg luminance.
  const darken = bgLum > 0.5;
  for (let step = 1; step <= 30; step++) {
    const delta = step * 8;
    const adjusted = rgb.map((c) => Math.max(0, Math.min(255, darken ? c - delta : c + delta))) as [
      number,
      number,
      number
    ];
    const ratio = contrastRatio(rgbToHex(adjusted), bgHex);
    if (ratio !== null && ratio >= target) return rgbToHex(adjusted);
  }
  return fgHex;
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  return "#" + [r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("");
}

// -----------------------------------------------------------------------------
// Action-list checker
// -----------------------------------------------------------------------------

type Action = Record<string, unknown> & { type?: string };

export function checkA11y(
  actions: ReadonlyArray<Action>,
  page: { bg: string; fg: string; lang?: string }
): A11yReport {
  const issues: A11yIssue[] = [];

  // Page-level: lang attribute.
  if (!page.lang) {
    issues.push({
      severity: "error",
      rule: "missing-lang",
      path: "page.lang",
      message: 'Document missing <html lang="…"> attribute.',
      fix: 'Set page.lang = "en" (or the user\'s detected locale).'
    });
  }

  // Page-level: base contrast.
  const baseContrast = contrastRatio(page.fg, page.bg);
  if (baseContrast !== null && baseContrast < 4.5) {
    issues.push({
      severity: "error",
      rule: "contrast",
      path: "theme.fg vs theme.bg",
      message: `Body contrast ${baseContrast.toFixed(2)}:1 fails WCAG AA 4.5:1.`,
      fix: `Adjust foreground to ${adjustForContrast(page.fg, page.bg)}.`
    });
  }

  // Section-level checks.
  let headingLevel = 0;
  let h1Count = 0;
  actions.forEach((action, i) => {
    if (typeof action.type !== "string") return;

    // Heading hierarchy
    const headings = collectHeadings(action);
    for (const h of headings) {
      if (h.level === 1) h1Count += 1;
      if (headingLevel > 0 && h.level > headingLevel + 1) {
        issues.push({
          severity: "warn",
          rule: "heading-order",
          path: `actions[${i}].${h.path}`,
          message: `Heading jumps from h${headingLevel} to h${h.level}. Skipping levels hurts screen readers.`,
          fix: `Use h${headingLevel + 1} instead.`
        });
      }
      headingLevel = Math.max(headingLevel, h.level);
    }

    // Images need alt text.
    const images = collectImages(action);
    for (const img of images) {
      if (!img.alt || img.alt.trim().length < 2) {
        issues.push({
          severity: "error",
          rule: "missing-alt",
          path: `actions[${i}].${img.path}`,
          message: "Image missing alt text.",
          fix: "Generate via Gemini Vision: describe what the image shows in <=120 chars."
        });
      }
    }

    // Interactive elements need accessible names.
    const interactives = collectInteractives(action);
    for (const el of interactives) {
      if (!el.label && !el.text) {
        issues.push({
          severity: "error",
          rule: "missing-label",
          path: `actions[${i}].${el.path}`,
          message: `Interactive ${el.kind} has no accessible name (text content or aria-label).`,
          fix: "Provide visible text or set ariaLabel."
        });
      }
    }
  });

  if (h1Count > 1) {
    issues.push({
      severity: "warn",
      rule: "heading-order",
      path: "document",
      message: `${h1Count} <h1> elements on page; use exactly one.`
    });
  }

  const errors = issues.filter((i) => i.severity === "error").length;
  const warns = issues.filter((i) => i.severity === "warn").length;
  const score = Math.max(0, 100 - errors * 15 - warns * 5);

  return { ok: errors === 0, issues, score };
}

// -----------------------------------------------------------------------------
// Action traversal helpers (loose — match existing semantic action contract)
// -----------------------------------------------------------------------------

function collectHeadings(action: Action): Array<{ level: number; path: string }> {
  const out: Array<{ level: number; path: string }> = [];
  walk(action, (path, value) => {
    if (typeof value === "object" && value && "level" in value && "text" in value) {
      const v = value as { level?: number; text?: string };
      if (typeof v.level === "number") out.push({ level: v.level, path });
    }
    if (path.endsWith(".heading") && typeof value === "string") out.push({ level: 1, path });
  });
  return out;
}

function collectImages(action: Action): Array<{ alt?: string; path: string }> {
  const out: Array<{ alt?: string; path: string }> = [];
  walk(action, (path, value) => {
    if (
      typeof value === "object" &&
      value &&
      ("src" in value || "url" in value || "imageUrl" in value)
    ) {
      out.push({ alt: (value as { alt?: string }).alt, path });
    }
  });
  return out;
}

function collectInteractives(
  action: Action
): Array<{ kind: "button" | "link"; label?: string; text?: string; path: string }> {
  const out: Array<{ kind: "button" | "link"; label?: string; text?: string; path: string }> = [];
  walk(action, (path, value) => {
    if (typeof value === "object" && value) {
      const v = value as { kind?: string; href?: string; onClick?: unknown; label?: string; text?: string; ariaLabel?: string };
      const isLink = "href" in v;
      const isButton = "onClick" in v || v.kind === "button";
      if (isLink || isButton) {
        out.push({
          kind: isLink ? "link" : "button",
          label: v.label ?? v.ariaLabel,
          text: v.text,
          path
        });
      }
    }
  });
  return out;
}

function walk(obj: unknown, visit: (path: string, value: unknown) => void, prefix = ""): void {
  if (obj === null || obj === undefined) return;
  visit(prefix, obj);
  if (Array.isArray(obj)) obj.forEach((v, i) => walk(v, visit, `${prefix}[${i}]`));
  else if (typeof obj === "object") {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      walk(v, visit, prefix ? `${prefix}.${k}` : k);
    }
  }
}
