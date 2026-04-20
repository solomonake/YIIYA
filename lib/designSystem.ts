export type LayoutDensity = "compact" | "balanced" | "spacious";

export type YiiyaTheme = {
  spacingMultiplier: number;
  borderRadius: number;
  primaryAccent: string;
  fontScale: number;
  layoutDensity: LayoutDensity;
  background: string;
  foreground: string;
  mutedForeground: string;
  surface: string;
  border: string;
  fontWeight: number;
  palette: string[];
};

export type CompiledYiiyaTheme = YiiyaTheme & {
  cssVariables: Record<string, string>;
  layoutTokens: {
    hero: "CENTERED_IMPACT" | "EDITORIAL_SPLIT" | "BENTO_GRID";
    features: "FEATURES_GRID" | "FEATURES_HORIZONTAL";
  };
  spacing: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
    sectionY: number;
    sectionX: number;
  };
  type: {
    hero: number;
    title: number;
    body: number;
    small: number;
  };
};

export const defaultYiiyaTheme: YiiyaTheme = {
  spacingMultiplier: 0.92,
  borderRadius: 4,
  primaryAccent: "#EF9F27",
  fontScale: 1,
  layoutDensity: "compact",
  background: "#050505",
  foreground: "#EDEDED",
  mutedForeground: "rgba(237, 237, 237, 0.62)",
  surface: "rgba(255, 255, 255, 0.045)",
  border: "#1A1A1A",
  fontWeight: 620,
  palette: ["#050505", "#EDEDED", "#EF9F27"]
};

export const vibePresets: Record<string, Partial<YiiyaTheme>> = {
  luxury: {
    spacingMultiplier: 1.32,
    borderRadius: 4,
    primaryAccent: "#D8B56D",
    fontScale: 1.08,
    layoutDensity: "spacious",
    background: "#0A0A0A",
    foreground: "#F5F0E6",
    mutedForeground: "rgba(245, 240, 230, 0.68)",
    surface: "rgba(255, 255, 255, 0.06)",
    border: "rgba(216, 181, 109, 0.22)",
    fontWeight: 580,
    palette: ["#0A0A0A", "#F5F0E6", "#D8B56D"]
  },
  institutional: {
    spacingMultiplier: 0.86,
    borderRadius: 4,
    primaryAccent: "#EF9F27",
    fontScale: 0.96,
    layoutDensity: "compact",
    background: "#050505",
    foreground: "#EDEDED",
    mutedForeground: "rgba(237, 237, 237, 0.62)",
    surface: "rgba(255, 255, 255, 0.04)",
    border: "#1A1A1A",
    fontWeight: 600,
    palette: ["#050505", "#EDEDED", "#EF9F27"]
  },
  playful: {
    spacingMultiplier: 1.12,
    borderRadius: 8,
    primaryAccent: "#39FF14",
    fontScale: 1.02,
    layoutDensity: "balanced",
    background: "#FFF8EC",
    foreground: "#171717",
    mutedForeground: "rgba(23, 23, 23, 0.66)",
    surface: "rgba(255, 255, 255, 0.72)",
    border: "rgba(23, 23, 23, 0.12)",
    fontWeight: 620,
    palette: ["#FFF8EC", "#171717", "#39FF14"]
  }
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function densityFactor(layoutDensity: LayoutDensity) {
  if (layoutDensity === "compact") {
    return 0.78;
  }

  if (layoutDensity === "spacious") {
    return 1.22;
  }

  return 1;
}

export function compileYiiyaTheme(theme: YiiyaTheme): CompiledYiiyaTheme {
  const density = densityFactor(theme.layoutDensity);
  const spacing = theme.spacingMultiplier * density;
  const fontScale = clamp(theme.fontScale, 0.75, 1.4);

  const compiled: CompiledYiiyaTheme = {
    ...theme,
    spacingMultiplier: clamp(theme.spacingMultiplier, 0.5, 2),
    borderRadius: clamp(theme.borderRadius, 0, 12),
    fontScale,
    cssVariables: {
      "--yiiya-bg": theme.background,
      "--yiiya-fg": theme.foreground,
      "--yiiya-muted": theme.mutedForeground,
      "--yiiya-surface": theme.surface,
      "--yiiya-border": theme.border,
      "--yiiya-accent": theme.primaryAccent,
      "--yiiya-gap": `${20 * spacing}px`,
      "--yiiya-radius": `${clamp(theme.borderRadius, 0, 12)}px`,
      "--yiiya-font-scale": String(fontScale)
    },
    layoutTokens: {
      hero:
        theme.layoutDensity === "compact"
          ? "BENTO_GRID"
          : theme.layoutDensity === "spacious"
            ? "EDITORIAL_SPLIT"
            : "CENTERED_IMPACT",
      features: theme.layoutDensity === "spacious" ? "FEATURES_HORIZONTAL" : "FEATURES_GRID"
    },
    spacing: {
      xs: 8 * spacing,
      sm: 12 * spacing,
      md: 20 * spacing,
      lg: 32 * spacing,
      xl: 48 * spacing,
      sectionY: Math.max(64, 56 * spacing),
      sectionX: 40 * spacing
    },
    type: {
      hero: 64 * fontScale,
      title: 40 * fontScale,
      body: 16 * fontScale,
      small: 12 * fontScale
    }
  };

  return compiled;
}

export function mergeYiiyaTheme(
  currentTheme: YiiyaTheme,
  partialTheme: Partial<YiiyaTheme>
): YiiyaTheme {
  return {
    ...currentTheme,
    ...partialTheme,
    spacingMultiplier:
      typeof partialTheme.spacingMultiplier === "number"
        ? clamp(partialTheme.spacingMultiplier, 0.5, 2)
        : currentTheme.spacingMultiplier,
    borderRadius:
      typeof partialTheme.borderRadius === "number"
        ? clamp(partialTheme.borderRadius, 0, 48)
        : currentTheme.borderRadius,
    fontScale:
      typeof partialTheme.fontScale === "number"
        ? clamp(partialTheme.fontScale, 0.75, 1.4)
        : currentTheme.fontScale,
    layoutDensity: partialTheme.layoutDensity ?? currentTheme.layoutDensity,
    palette:
      partialTheme.palette && partialTheme.palette.length > 0
        ? partialTheme.palette
        : currentTheme.palette
  };
}

export function densityFromScale(scale: number): LayoutDensity {
  if (scale < 0.85) {
    return "compact";
  }

  if (scale > 1.25) {
    return "spacious";
  }

  return "balanced";
}

export function themeFromVibe(vibe: string): Partial<YiiyaTheme> {
  const normalized = vibe.toLowerCase();

  if (
    normalized.includes("luxury") ||
    normalized.includes("watch") ||
    normalized.includes("premium")
  ) {
    return vibePresets.luxury;
  }

  if (
    normalized.includes("terminal") ||
    normalized.includes("institutional") ||
    normalized.includes("bloomberg")
  ) {
    return vibePresets.institutional;
  }

  if (
    normalized.includes("playful") ||
    normalized.includes("bright") ||
    normalized.includes("viral")
  ) {
    return vibePresets.playful;
  }

  return {};
}
