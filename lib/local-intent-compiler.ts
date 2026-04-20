import { themeFromVibe, type YiiyaTheme } from "@/lib/designSystem";

type LocalCompilerInput = {
  transcript: string;
  activeElementId: string | null;
  referenceImage?: {
    base64: string;
    mediaType: string;
    name: string;
  } | null;
};

type LocalAction = {
  type: string;
  payload: Record<string, unknown>;
};

const colorMap: Record<string, string> = {
  amber: "#EF9F27",
  black: "#050505",
  blue: "#3B82F6",
  cream: "#F5F5F0",
  gold: "#D8B56D",
  green: "#39FF14",
  orange: "#EF9F27",
  pink: "#EC4899",
  purple: "#8B5CF6",
  red: "#EF4444",
  white: "#EDEDED",
  yellow: "#FACC15"
};

function hasAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

function titleCase(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((word) => `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}`)
    .join(" ");
}

function compactThemePayload(theme: Partial<YiiyaTheme>) {
  return {
    spacingMultiplier: theme.spacingMultiplier,
    borderRadius: theme.borderRadius,
    primaryAccent: theme.primaryAccent,
    fontScale: theme.fontScale,
    layoutDensity: theme.layoutDensity,
    palette: theme.palette,
    fontWeight: theme.fontWeight
  };
}

function inferBrandSubject(text: string) {
  const patterns = [
    /(?:for|about|called)\s+([a-z0-9\s-]{3,42})/,
    /(photography studio(?:\s+in\s+[a-z\s]+)?)/,
    /(photography (?:portfolio|landing page|site|website))/,
    /(photography)/,
    /(natural hair care brand)/,
    /(creative agency)/,
    /(portfolio)/,
    /(restaurant)/,
    /(saas product)/
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern)?.[1]?.trim();

    if (match) {
      return titleCase(match.replace(/\s+/g, " "));
    }
  }

  return "New Venture";
}

function sectionContent(sectionType: string, subject: string) {
  if (sectionType === "HERO") {
    return {
      heading: subject,
      subtext:
        "A sharp, conversion-ready digital presence generated from plain language.",
      cta: "Start now"
    };
  }

  if (sectionType === "ABOUT") {
    return {
      heading: `Built around ${subject}`,
      subtext:
        "A focused brand story with clear hierarchy, concise copy, and room for visual direction."
    };
  }

  if (sectionType === "FEATURES") {
    return {
      heading: "What stands out",
      features: [
        {
          heading: "Fast launch",
          subtext: "Move from rough intent to a usable page in minutes."
        },
        {
          heading: "Design system driven",
          subtext: "Global tokens keep spacing, radius, color, and density aligned."
        },
        {
          heading: "Spatial layer",
          subtext: "Add 3D objects into the same canvas without a separate tool."
        }
      ]
    };
  }

  return {
    heading: "Start the conversation",
    subtext: "Use this section to collect high-intent leads.",
    cta: "Send request"
  };
}

function addSection(actions: LocalAction[], sectionType: string, subject: string) {
  actions.push({
    type: "ADD_SECTION",
    payload: {
      sectionType,
      theme: {},
      content: sectionContent(sectionType, subject)
    }
  });
}

function inferMaterial(text: string) {
  if (text.includes("glass")) {
    return "Glass";
  }

  if (text.includes("chrome") || text.includes("metal")) {
    return "Chrome";
  }

  return "Matte";
}

function inferShape(text: string) {
  if (text.includes("cube") || text.includes("box")) {
    return "box";
  }

  if (text.includes("torus") || text.includes("ring")) {
    return "torus";
  }

  if (text.includes("cylinder")) {
    return "cylinder";
  }

  return "sphere";
}

function inferColor(text: string) {
  for (const [name, value] of Object.entries(colorMap)) {
    if (text.includes(name)) {
      return value;
    }
  }

  const hex = text.match(/#[0-9a-f]{6}\b/i)?.[0];

  return hex ?? "#EF9F27";
}

function compileElementModification(input: LocalCompilerInput, text: string) {
  if (!input.activeElementId) {
    return null;
  }

  if (hasAny(text, ["bigger", "larger", "increase", "scale up"])) {
    return {
      type: "MODIFY_ELEMENT",
      payload: {
        elementId: input.activeElementId,
        property: "fontSize",
        value: 1.2,
        mode: "multiply"
      }
    };
  }

  if (hasAny(text, ["smaller", "reduce", "shrink", "scale down"])) {
    return {
      type: "MODIFY_ELEMENT",
      payload: {
        elementId: input.activeElementId,
        property: "fontSize",
        value: 0.88,
        mode: "multiply"
      }
    };
  }

  const color = inferColor(text);

  if (color !== "#EF9F27" || text.includes("amber") || text.includes("orange")) {
    return {
      type: "MODIFY_ELEMENT",
      payload: {
        elementId: input.activeElementId,
        property: hasAny(text, ["background", "button"]) ? "backgroundColor" : "color",
        value: color,
        mode: "replace"
      }
    };
  }

  if (text.includes("round")) {
    return {
      type: "MODIFY_ELEMENT",
      payload: {
        elementId: input.activeElementId,
        property: "borderRadius",
        value: "24px",
        mode: "replace"
      }
    };
  }

  return null;
}

export function compileLocalIntent(input: LocalCompilerInput) {
  const text = input.transcript.toLowerCase();
  const actions: LocalAction[] = [];
  const subject = inferBrandSubject(text);
  const theme = themeFromVibe(text);
  const modification = compileElementModification(input, text);

  if (Object.keys(theme).length > 0) {
    actions.push({
      type: "SET_GLOBAL_THEME",
      payload: compactThemePayload(theme)
    });
  }

  if (input.referenceImage && hasAny(text, ["reference", "image", "screenshot", "palette"])) {
    actions.push({
      type: "SYNC_BRAND_TO_IMAGE",
      payload: {
        palette: theme.palette ?? ["#050505", "#EDEDED", "#EF9F27"],
        fontWeights: [theme.fontWeight ?? 600],
        layoutStructure: "reference-informed",
        visualTone: text.includes("bright") ? "bright reference" : "reference-driven"
      }
    });
  }

  if (hasAny(text, ["denser", "compact", "tighter"])) {
    actions.push({ type: "ADJUST_DENSITY", payload: { scale: 0.72 } });
  }

  if (hasAny(text, ["spacious", "more room", "breathe", "premium"])) {
    actions.push({ type: "ADJUST_DENSITY", payload: { scale: 1.34 } });
  }

  if (modification) {
    actions.push(modification);
  }

  if (hasAny(text, ["3d", "sphere", "cube", "object", "glass", "chrome"])) {
    actions.push({
      type: "ADD_SPATIAL_OBJECT",
      payload: {
        shape: inferShape(text),
        material: inferMaterial(text),
        color: inferColor(text),
        animation: hasAny(text, ["spin", "rotate", "rotating"]) ? "rotate" : "float",
        position: [0, 1.2, 0]
      }
    });
  }

  const wantsSite =
    hasAny(text, [
      "build",
      "create",
      "generate",
      "landing",
      "website",
      "site",
      "page"
    ]) ||
    (text.includes("make") &&
      hasAny(text, ["landing", "website", "site", "page"]));

  if (wantsSite || hasAny(text, ["hero", "about", "features", "contact"])) {
    if (wantsSite || text.includes("hero")) {
      addSection(actions, "HERO", subject);
    }

    if (wantsSite || text.includes("about")) {
      addSection(actions, "ABOUT", subject);
    }

    if (wantsSite || text.includes("features") || text.includes("bento")) {
      addSection(actions, "FEATURES", subject);
    }

    if (wantsSite || text.includes("contact") || text.includes("form")) {
      addSection(actions, "CONTACT", subject);
    }
  }

  if (text.includes("publish")) {
    actions.push({ type: "PUBLISH", payload: {} });
  }

  return actions;
}
