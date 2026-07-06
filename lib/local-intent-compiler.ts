import { themeFromVibe, type YiiyaTheme } from "@/lib/designSystem";
import type { CursorTarget } from "@/lib/scene/types";
import { classifyPromptSubject } from "@/lib/scene/prompt-intent";

type LocalCompilerInput = {
  transcript: string;
  activeElementId: string | null;
  current_canvas_json?: object;
  history?: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
  referenceImage?: {
    base64: string;
    mediaType: string;
    name: string;
    previewUrl?: string;
    dominantColor?: string;
    accentCandidate?: string;
    extractedMode?: "dark" | "light";
    aspectRatio?: number;
    silhouette?: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    imageMode?: "web" | "3d" | "hybrid";
  } | null;
  image_mode?: "web" | "3d" | "hybrid";
  cursorTarget?: CursorTarget | null;
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
  gold: "#FFD700",
  green: "#39FF14",
  orange: "#EF9F27",
  pink: "#EC4899",
  purple: "#8B5CF6",
  red: "#EF4444",
  white: "#EDEDED",
  yellow: "#FACC15"
};

type CreativeArchetype =
  | "brand-poster"
  | "service-business"
  | "creative-portfolio"
  | "interactive-concept"
  | "reference-rebuild";

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

function inferCreativeArchetype(text: string, input: LocalCompilerInput): CreativeArchetype {
  if (input.referenceImage && (input.image_mode === "web" || input.image_mode === "hybrid" || input.referenceImage.imageMode === "web" || input.referenceImage.imageMode === "hybrid")) {
    return "reference-rebuild";
  }

  if (
    hasAny(text, [
      "interactive",
      "crazy",
      "concept",
      "game",
      "configurator",
      "calculator",
      "playlist",
      "experience",
      "microsite"
    ])
  ) {
    return "interactive-concept";
  }

  if (
    hasAny(text, [
      "portfolio",
      "photography",
      "studio",
      "agency",
      "artist",
      "designer",
      "music",
      "fashion",
      "architecture"
    ])
  ) {
    return "creative-portfolio";
  }

  if (
    hasAny(text, [
      "plumbing",
      "dental",
      "law",
      "restaurant",
      "cafe",
      "salon",
      "gym",
      "real estate",
      "service",
      "contractor"
    ])
  ) {
    return "service-business";
  }

  return "brand-poster";
}

function cityFromText(text: string) {
  const match = text.match(/\bin\s+([a-z\s]{3,28})$/i)?.[1]?.trim();

  return match ? titleCase(match) : "a major city";
}

function inferIndustry(text: string) {
  const industries = [
    "luxury watch",
    "watch",
    "plumbing",
    "restaurant",
    "photography",
    "studio",
    "agency",
    "fashion",
    "architecture",
    "music",
    "dental",
    "law",
    "real estate",
    "salon",
    "gym",
    "startup",
    "portfolio"
  ];

  return industries.find((industry) => text.includes(industry)) ?? "venture";
}

function visualToken(input: LocalCompilerInput, text: string) {
  const reference = input.referenceImage;

  if (reference?.previewUrl) {
    return {
      source: "reference-image",
      imageUrl: reference.previewUrl,
      crop: reference.aspectRatio && reference.aspectRatio > 1.25 ? "portrait-focus" : "full-bleed",
      placement: text.includes("split") ? "right" : "background",
      overlay: reference.extractedMode === "light" ? 0.46 : 0.68,
      fidelity: "mirror-composition"
    };
  }

  if (hasAny(text, ["watch", "product", "bottle", "chair", "fashion"])) {
    return {
      source: "generated-product-plane",
      placement: "right",
      crop: "hero-object",
      overlay: 0.5,
      fidelity: "object-forward"
    };
  }

  return {
    source: "spatial-canvas",
    placement: "ambient",
    crop: "wide",
    overlay: 0.38,
    fidelity: "brand-atmosphere"
  };
}

function designDNA(archetype: CreativeArchetype, text: string, input: LocalCompilerInput) {
  return {
    archetype,
    mood: hasAny(text, ["luxury", "premium", "watch"])
      ? "quiet luxury"
      : hasAny(text, ["crazy", "interactive", "experimental"])
        ? "computational spectacle"
        : hasAny(text, ["emergency", "service", "plumbing"])
          ? "urgent trust"
          : "editorial institutional",
    density: archetype === "brand-poster" ? "spacious" : "balanced",
    motion: archetype === "interactive-concept" ? "kinetic spring" : "subtle editorial",
    referenceFidelity: input.referenceImage ? "high" : "none"
  };
}

function inferRequestedName(rawTranscript: string) {
  const patterns = [
    /\b(?:change|rename|set)\s+(?:the\s+)?(?:project\s+)?name\s+(?:to|as)\s+(.+)$/i,
    /\bcall\s+(?:it|this|the project)\s+(.+)$/i,
    /\bmake\s+(?:the\s+)?(?:brand|company|project)\s+(?:name\s+)?(.+)$/i
  ];

  for (const pattern of patterns) {
    const match = rawTranscript.match(pattern)?.[1]?.trim();

    if (match) {
      return match
        .replace(/[.!?]+$/g, "")
        .replace(/^["']|["']$/g, "")
        .trim();
    }
  }

  return null;
}

function sectionContent(
  sectionType: string,
  subject: string,
  text: string,
  archetype: CreativeArchetype,
  input: LocalCompilerInput
) {
  const industry = inferIndustry(text);
  const city = cityFromText(input.transcript);
  const visual = visualToken(input, text);
  const dna = designDNA(archetype, text, input);
  const isLuxury = hasAny(text, ["luxury", "watch", "premium"]);
  const isService = archetype === "service-business";
  const isCreative = archetype === "creative-portfolio";

  if (sectionType === "NAVBAR") {
    return {
      brand: subject,
      links: isService ? ["Services", "Proof", "Book"] : ["Work", "Story", "Contact"],
      cta: isService ? "Book now" : "Start",
      designDNA: dna
    };
  }

  if (sectionType === "HERO") {
    return {
      heading:
        isLuxury
          ? `${subject} in motion`
          : isService
            ? `${subject} you can trust today`
            : isCreative
              ? `${subject} without the expected frame`
              : subject,
      eyebrow:
        archetype === "reference-rebuild"
          ? "Reference matched"
          : isService
            ? `Serving ${city}`
            : "Yiiya live canvas",
      subtext:
        isService
          ? `Clear pricing, fast response, and real proof for ${industry} customers in ${city}.`
          : isCreative
            ? "A visual-first digital presence shaped around mood, proof, and a memorable first interaction."
            : isLuxury
              ? "A restrained product story with tactile detail, scarcity, and a premium conversion path."
              : "A sharp digital surface that feels built for the idea, not stamped from a template.",
      cta: isService ? "Request service" : isLuxury ? "View collection" : "Start now",
      visual,
      designDNA: dna
    };
  }

  if (sectionType === "ABOUT") {
    return {
      heading: isCreative ? "Direction before decoration" : `Built around ${subject}`,
      subtext:
        isService
          ? "Every section answers a buyer question: what you do, why it is reliable, how fast they can act, and what happens next."
          : "The page uses one strong composition, short copy, and a visual rhythm that can keep adapting as the idea gets sharper.",
      visual,
      designDNA: dna
    };
  }

  if (sectionType === "FEATURES") {
    return {
      heading:
        isService
          ? "Why people choose this"
          : isCreative
            ? "Creative system"
            : "What makes it feel alive",
      features: [
        {
          heading: isService ? "Fast response" : "Reference-aware",
          subtext: isService
            ? "The offer makes timing, service area, and next steps obvious."
            : "Uploaded imagery controls palette, density, and visual direction immediately."
        },
        {
          heading: isCreative ? "Editorial rhythm" : "Design system driven",
          subtext: "Layout, type, spacing, and color stay tokenized so edits remain clean."
        },
        {
          heading: "Molded 3D",
          subtext: "Speak objects, materials, and motion into the same canvas."
        }
      ],
      interaction:
        archetype === "interactive-concept"
          ? { type: "configurator", label: "Concept tuner" }
          : undefined,
      designDNA: dna
    };
  }

  if (sectionType === "SERVICES") {
    return {
      heading: isService ? "Services people actually search for" : "Services built for momentum",
      services: [
        {
          heading: isService ? "Urgent requests" : "Launch strategy",
          subtext: isService
            ? "Same-day priority intake with direct CTA language."
            : "Position the offer, audience, and page structure before build."
        },
        {
          heading: isService ? "Transparent scope" : "Visual system",
          subtext: isService
            ? "Simple service descriptions reduce friction before contact."
            : "Translate the brand mood into tokens, sections, and reusable patterns."
        },
        {
          heading: isService ? "Proof-ready follow up" : "Conversion page",
          subtext: isService
            ? "Testimonials, FAQs, and contact fields support real sales calls."
            : "Ship a focused landing page with clear proof and next steps."
        }
      ],
      designDNA: dna
    };
  }

  if (sectionType === "METRICS") {
    return {
      heading: isService ? "Signals that build trust" : "Operating signals",
      metrics: [
        { value: isService ? "24/7" : "4x", label: isService ? "Response window" : "Faster drafts" },
        { value: isLuxury ? "42" : "96%", label: isLuxury ? "Limited pieces" : "Clearer first pass" },
        { value: "3", label: "Primary actions" },
        { value: "1", label: "Strong visual thesis" }
      ],
      designDNA: dna
    };
  }

  if (sectionType === "LOGO_STRIP") {
    return {
      logos: ["Aster", "Northline", "Vanta", "Echelon", "Monarch", "Kepler"]
    };
  }

  if (sectionType === "TESTIMONIALS") {
    return {
      heading: "Proof from real buyers",
      testimonials: [
        {
          quote:
            "The first draft gave us enough clarity to pitch the direction immediately. Every edit stayed structured and fast.",
          name: "Amina Cole",
          role: "Founder"
        },
        {
          quote:
            "It felt like a creative director and front-end team in the same room. The canvas made iteration visible.",
          name: "David Lin",
          role: "Agency lead"
        },
        {
          quote:
            "We moved from a rough brief to a page we could review with clients. The voice loop changed the meeting.",
          name: "Nia Brooks",
          role: "Producer"
        }
      ]
    };
  }

  if (sectionType === "PRICING") {
    return {
      heading: "Simple engagement model",
      plans: [
        {
          name: "Starter",
          price: "$49",
          features: ["One project", "Voice editing", "Local drafts", "Publish link"]
        },
        {
          name: "Pro",
          price: "$149",
          features: ["Unlimited projects", "3D scenes", "Reference images", "Sync history"]
        },
        {
          name: "Studio",
          price: "$399",
          features: ["Team projects", "Client review", "Custom themes", "Priority support"]
        }
      ]
    };
  }

  if (sectionType === "FAQ") {
    return {
      heading: "Questions before launch",
      faqs: [
        {
          question: "Can this be edited after publish?",
          answer: "Yes. Yiiya keeps project state structured so future edits can target sections and elements."
        },
        {
          question: "Can I mix websites and 3D?",
          answer: "Yes. The spatial layer can sit behind, above, or beside the generated web sections."
        },
        {
          question: "Does reference imagery affect the theme?",
          answer: "Dropped images immediately update the palette before the model responds."
        },
        {
          question: "Do guests get the full canvas?",
          answer: "Guest users can use the full canvas, with local drafts and watermarked publishing."
        },
        {
          question: "Is there an accordion?",
          answer: "Not yet. Answers stay visible so the first pass remains simple and editable."
        }
      ]
    };
  }

  if (sectionType === "FOOTER") {
    return {
      brand: subject,
      subtext: isService
        ? `Built for real ${industry} demand in ${city}.`
        : "Built with Yiiya.",
      links: isService
        ? ["Services", "Reviews", "Coverage", "FAQ", "Book"]
        : ["Work", "Story", "Services", "Proof", "Contact"],
      designDNA: dna
    };
  }

  return {
    heading: isService ? "Start with the problem" : "Start the conversation",
    subtext: isService
      ? "Tell us what is happening and when you need help. The next step should feel obvious."
      : "Use this section to turn interest into a real next step.",
    cta: isService ? "Request help" : "Send request",
    interaction: { type: isService ? "booking" : "quote-builder" },
    designDNA: dna
  };
}

function inferHeroLayoutVariant(text: string, archetype: CreativeArchetype) {
  if (archetype === "reference-rebuild") {
    return "EDITORIAL_SPLIT";
  }

  if (archetype === "interactive-concept") {
    return "BENTO_GRID";
  }

  if (hasAny(text, ["product", "startup", "data", "dashboard", "bento"])) {
    return "BENTO_GRID";
  }

  if (hasAny(text, ["agency", "portfolio", "professional", "service"]) || archetype === "creative-portfolio") {
    return "EDITORIAL_SPLIT";
  }

  return "CENTERED_IMPACT";
}

function inferFeaturesLayoutVariant(text: string) {
  if (hasAny(text, ["scroll", "showcase", "gallery"])) {
    return "FEATURES_HORIZONTAL";
  }

  return "FEATURES_GRID";
}

function addSection(
  actions: LocalAction[],
  sectionType: string,
  subject: string,
  text: string,
  archetype: CreativeArchetype,
  input: LocalCompilerInput
) {
  const layoutVariant =
    sectionType === "HERO"
      ? inferHeroLayoutVariant(text, archetype)
      : sectionType === "FEATURES"
        ? inferFeaturesLayoutVariant(text)
        : undefined;

  actions.push({
    type: "ADD_SECTION",
    payload: {
      sectionType,
      layoutVariant,
      theme: {},
      content: sectionContent(sectionType, subject, text, archetype, input)
    }
  });
}

function inferMaterial(text: string) {
  if (text.includes("glass")) {
    return "glass";
  }

  if (text.includes("chrome") || text.includes("metal")) {
    return "chrome";
  }

  if (text.includes("gold")) {
    return "gold";
  }

  if (text.includes("carbon")) {
    return "carbon";
  }

  if (text.includes("holographic") || text.includes("hologram")) {
    return "holographic";
  }

  return "matte";
}

function inferShape(text: string) {
  if (hasAny(text, ["car", "vehicle", "truck", "sedan", "suv", "bike", "motorcycle"])) {
    return "vehicle";
  }

  if (text.includes("plane") || text.includes("panel")) {
    return "plane";
  }

  if (text.includes("cube") || text.includes("box")) {
    return "box";
  }

  if (text.includes("torus") || text.includes("ring")) {
    return "torus";
  }

  if (text.includes("cylinder")) {
    return "cylinder";
  }

  if (text.includes("cone")) {
    return "cone";
  }

  if (text.includes("capsule")) {
    return "capsule";
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

function inferSemanticFamily(text: string) {
  if (hasAny(text, ["car", "vehicle", "truck", "sedan", "suv", "bike", "motorcycle"])) {
    return "vehicle";
  }

  if (hasAny(text, ["chair", "table", "desk", "stool", "sofa", "lamp"])) {
    return "furniture";
  }

  if (hasAny(text, ["bottle", "cup", "mug", "vase", "jar"])) {
    return "vessel";
  }

  return "object";
}

function inferLibraryModelUrl(text: string) {
  if (hasAny(text, ["car", "vehicle", "truck", "sedan", "suv"])) {
    return "library://car";
  }

  const libraryKeys = [
    "cup",
    "bottle",
    "laptop",
    "phone",
    "watch",
    "chair",
    "table",
    "lamp",
    "shoe",
    "bag",
    "plant",
    "camera"
  ];
  const match = libraryKeys.find((key) => text.includes(key));
  return match ? `library://${match}` : "";
}

function hasDirectReference(text: string) {
  return /\b(?:this|that|it|here|selected|circled|targeted|this one)\b/.test(text);
}

function resolveElementTarget(input: LocalCompilerInput, text: string) {
  if (input.activeElementId) {
    return input.activeElementId;
  }

  if (hasDirectReference(text)) {
    return input.cursorTarget?.domElementId ?? null;
  }

  return null;
}

function resolveObjectTarget(input: LocalCompilerInput) {
  return input.cursorTarget?.sceneObjectId ?? "latest";
}

function compileElementModification(input: LocalCompilerInput, text: string) {
  const elementId = resolveElementTarget(input, text);

  if (!elementId) {
    return [];
  }

  const actions: LocalAction[] = [];

  if (
    hasAny(text, ["center", "centered", "middle", "centre", "move this to middle"])
  ) {
    actions.push(
      {
        type: "MODIFY_ELEMENT",
        payload: {
          elementId,
          property: "textAlign",
          value: "center",
          mode: "replace"
        }
      },
      {
        type: "MODIFY_ELEMENT",
        payload: {
          elementId,
          property: "marginInline",
          value: "auto",
          mode: "replace"
        }
      }
    );
  }

  if (hasAny(text, ["bigger", "larger", "increase", "scale up", "more"])) {
    actions.push({
      type: "MODIFY_ELEMENT",
      payload: {
        elementId,
        property: "fontSize",
        value: 1.2,
        mode: "multiply"
      }
    });
  }

  if (hasAny(text, ["smaller", "reduce", "shrink", "scale down", "less"])) {
    actions.push({
      type: "MODIFY_ELEMENT",
      payload: {
        elementId,
        property: "fontSize",
        value: 0.88,
        mode: "multiply"
      }
    });
  }

  const color = inferColor(text);

  if (color !== "#EF9F27" || text.includes("amber") || text.includes("orange")) {
    actions.push({
      type: "MODIFY_ELEMENT",
      payload: {
        elementId,
        property: hasAny(text, ["background", "button"]) ? "backgroundColor" : "color",
        value: color,
        mode: "replace"
      }
    });
  }

  if (text.includes("round")) {
    actions.push({
      type: "MODIFY_ELEMENT",
      payload: {
        elementId,
        property: "borderRadius",
        value: "24px",
        mode: "replace"
      }
    });
  }

  return actions;
}

export function compileLocalIntent(input: LocalCompilerInput) {
  const text = input.transcript.toLowerCase();
  const promptIntent = classifyPromptSubject(input.transcript);
  const actions: LocalAction[] = [];
  const subject = inferBrandSubject(text);
  const archetype = inferCreativeArchetype(text, input);
  const requestedName = inferRequestedName(input.transcript);
  const theme = themeFromVibe(text);
  const modifications = compileElementModification(input, text);
  const elementTarget = resolveElementTarget(input, text);
  const objectTarget = resolveObjectTarget(input);
  const modelUrl = promptIntent.kind === "object" ? inferLibraryModelUrl(text) : "";

  if (requestedName) {
    actions.push({
      type: "SET_PROJECT_NAME",
      payload: { projectName: titleCase(requestedName) }
    });

    if (elementTarget) {
      actions.push({
        type: "MODIFY_ELEMENT",
        payload: {
          elementId: elementTarget,
          property: "content",
          value: titleCase(requestedName),
          mode: "replace"
        }
      });
    }

    return actions;
  }

  if (Object.keys(theme).length > 0) {
    actions.push({
      type: "SET_GLOBAL_THEME",
      payload: compactThemePayload(theme)
    });
  }

  if (hasAny(text, ["redo", "redo that", "bring it back"])) {
    actions.push({ type: "REDO", payload: {} });
    return actions;
  }

  if (hasAny(text, ["undo", "undo that", "go back"])) {
    actions.push({ type: "UNDO", payload: {} });
    return actions;
  }

  if (input.referenceImage && hasAny(text, ["reference", "image", "screenshot", "palette"])) {
    if (input.image_mode === "3d" || input.referenceImage.imageMode === "3d") {
      actions.push(
        {
          type: "MORPH_BLOB",
          payload: {
            targetShape: "organic",
            distort: 0.42,
            speed: 1.2
          }
        },
        {
          type: "SET_MATERIAL",
          payload: {
            objectId: objectTarget,
            material: "matte",
            color: "#1a1a1a"
          }
        }
      );

      return actions;
    }

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

  if (modifications.length > 0) {
    actions.push(...modifications);
  }

  const wantsSpatialObject =
    promptIntent.kind === "object" &&
    !elementTarget &&
    !hasDirectReference(text) &&
    !hasAny(text, ["landing", "website", "site", "page", "section", "navbar", "footer"]);

  if (
    wantsSpatialObject ||
    hasAny(text, [
      "3d",
      "sphere",
      "cube",
      "object",
      "glass",
      "chrome",
      "gold",
      "carbon",
      "holographic",
      "plane",
      "panel",
      "cone",
      "capsule",
      "blob",
      "mold",
      "mould",
      "helix",
      "donut",
      "bottle",
      "taller",
      "wider",
      "left",
      "right",
      "up",
      "down",
      "floating"
    ])
  ) {
    if (hasAny(text, ["make it gold", "make this gold", "turn it gold", "make it glass", "make this glass", "turn it glass", "make it chrome", "make this chrome"])) {
      actions.push({
        type: "SET_MATERIAL",
        payload: {
          objectId: objectTarget,
          material: inferMaterial(text),
          metalness: text.includes("gold") ? 1 : undefined,
          roughness: text.includes("gold") ? 0.2 : undefined,
          color: text.includes("gold") ? "#FFD700" : undefined
        }
      });
      return actions;
    }

    if (hasAny(text, ["clear the mold", "clear mold", "reset mold"])) {
      actions.push({
        type: "REMOVE_OBJECT",
        payload: { objectId: "*" }
      });
      actions.push({
        type: "MOLD_BLOB",
        payload: {
          targetShape: "sphere",
          formation: "sphere",
          material: "carbon",
          distort: 0.5,
          speed: 1.8,
          glow: 0.35,
          chaos: 0.22,
          twist: 0
        }
      });
      return actions;
    }

    if (hasAny(text, ["move it left", "move left", "shift left"])) {
      actions.push({
        type: "MOVE_OBJECT",
        payload: { objectId: objectTarget, delta: [-0.45, 0, 0] }
      });
      return actions;
    }

    if (hasAny(text, ["move it right", "move right", "shift right"])) {
      actions.push({
        type: "MOVE_OBJECT",
        payload: { objectId: objectTarget, delta: [0.45, 0, 0] }
      });
      return actions;
    }

    if (hasAny(text, ["move it up", "move up", "raise it"])) {
      actions.push({
        type: "MOVE_OBJECT",
        payload: { objectId: objectTarget, delta: [0, 0.38, 0] }
      });
      return actions;
    }

    if (hasAny(text, ["move it down", "move down", "lower it"])) {
      actions.push({
        type: "MOVE_OBJECT",
        payload: { objectId: objectTarget, delta: [0, -0.38, 0] }
      });
      return actions;
    }

    if (hasAny(text, ["make it taller", "taller", "stretch it"])) {
      actions.push({
        type: "RESHAPE_OBJECT",
        payload: { objectId: objectTarget, scaleY: 1.55 }
      });
      actions.push({
        type: "MOLD_BLOB",
        payload: {
          targetShape: "bottle",
          formation: "bottle",
          aspectRatio: 1.8,
          distort: 0.28,
          speed: 1.05
        }
      });
      return actions;
    }

    if (hasAny(text, ["make it wider", "wider"])) {
      actions.push({
        type: "RESHAPE_OBJECT",
        payload: { objectId: objectTarget, scaleX: 1.45, scaleZ: 1.18 }
      });
      return actions;
    }

    if (hasAny(text, ["spin slower", "rotate slower", "slower spin"])) {
      actions.push({
        type: "SET_OBJECT_ANIMATION",
        payload: { objectId: objectTarget, animation: "rotate", intensity: 0.35 }
      });
      return actions;
    }

    if (hasAny(text, ["spin faster", "rotate faster", "faster spin"])) {
      actions.push({
        type: "SET_OBJECT_ANIMATION",
        payload: { objectId: objectTarget, animation: "rotate", intensity: 1.6 }
      });
      return actions;
    }

    if (hasAny(text, ["remove everything", "clear objects", "delete objects"])) {
      actions.push({
        type: "REMOVE_OBJECT",
        payload: { objectId: "*" }
      });
      return actions;
    }

    if (hasAny(text, ["blob", "morph", "mold", "mould", "look like a bottle", "like a bottle", "helix", "donut", "torus"])) {
      const formation = text.includes("helix")
        ? "helix"
        : text.includes("torus") || text.includes("donut")
          ? "torus"
          : text.includes("bottle")
            ? "bottle"
            : text.includes("cube")
              ? "cube"
              : text.includes("capsule")
                ? "capsule"
                : "sphere";
      actions.push({
        type: "MOLD_BLOB",
        payload: {
          targetShape: text.includes("bottle")
            ? "bottle"
            : text.includes("cube")
              ? "cube"
              : text.includes("crystal")
                ? "crystal"
                : text.includes("organic")
                  ? "organic"
                  : "sphere",
          formation,
          material: inferMaterial(text),
          distort: text.includes("bottle") ? 0.3 : 0.5,
          speed: text.includes("bottle") ? 1 : text.includes("helix") ? 2.2 : 1.8,
          glow: text.includes("glass") || text.includes("holographic") ? 0.72 : 0.42,
          chaos: hasAny(text, ["organic", "crazy", "chaotic"]) ? 0.82 : 0.28,
          twist: text.includes("helix") ? 1.35 : 0
        }
      });

      if (hasAny(text, ["gold", "glass", "chrome", "carbon", "holographic"])) {
        actions.push({
          type: "SET_MATERIAL",
          payload: {
            objectId: objectTarget,
            material: inferMaterial(text),
            metalness: text.includes("gold") ? 1 : undefined,
            roughness: text.includes("gold") ? 0.2 : undefined,
            color: text.includes("gold") ? "#FFD700" : undefined
          }
        });
      }
      return actions;
    }

    actions.push({
      type: "ADD_3D_OBJECT",
      payload: {
        prompt: promptIntent.kind === "object" ? promptIntent.generationPrompt : input.transcript,
        resolvedName: promptIntent.subject,
        shape: inferShape(text),
        semanticFamily: inferSemanticFamily(text),
        modelUrl,
        material: inferMaterial(text),
        color: inferColor(text),
        animation: hasAny(text, ["spin", "rotate", "rotating"]) ? "rotate" : "float",
        position: text.includes("behind") ? [0, 1.2, -1.4] : [0, 1.2, 0],
        scale: [1, 1, 1],
        intensity: text.includes("slow") ? 0.45 : 1
      }
    });

    if (hasAny(text, ["mold", "mould", "gold bottle", "glass bottle"])) {
      actions.push({
        type: "MOLD_BLOB",
        payload: {
          targetShape: text.includes("bottle") ? "bottle" : "organic",
          formation: text.includes("bottle") ? "bottle" : "sphere",
          material: inferMaterial(text),
          aspectRatio: text.includes("bottle") ? 1.75 : 1,
          distort: 0.34,
          speed: 1.2,
          glow: text.includes("glass") ? 0.88 : 0.45
        }
      });
    }
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

  const wantsHeroSection = hasAny(text, ["hero section", "add hero", "create hero"]);
  const wantsAboutSection = hasAny(text, ["about section", "add about"]);
  const wantsFeaturesSection = hasAny(text, [
    "features",
    "features section",
    "feature section",
    "add features",
    "bento"
  ]);
  const wantsContactSection = hasAny(text, [
    "contact section",
    "contact form",
    "add contact",
    "form"
  ]);
  const wantsNavbar = hasAny(text, ["navbar", "nav bar", "navigation", "menu"]);
  const wantsServices = hasAny(text, ["services", "offer", "offers"]);
  const wantsMetrics = hasAny(text, ["metrics", "stats", "numbers", "kpis"]);
  const wantsTestimonials = hasAny(text, [
    "testimonial",
    "testimonials",
    "social proof",
    "reviews"
  ]);
  const wantsPricing = hasAny(text, ["pricing", "plans", "packages"]);
  const wantsFaq = hasAny(text, ["faq", "questions"]);
  const wantsFooter = hasAny(text, ["footer"]);
  const wantsLogoStrip = hasAny(text, ["logo strip", "logo cloud", "logos", "brand strip"]);

  if (hasAny(text, ["more organic", "more glass", "more dramatic", "more glow", "more chaotic"])) {
    const isGlass = text.includes("glass");
    const property = isGlass || text.includes("glow") ? "glow" : text.includes("chaotic") || text.includes("organic") ? "chaos" : "distort";
    const label = isGlass ? "Glass refraction" : property === "chaos" ? "Organic chaos" : "Drama";
    actions.push({
      type: "SPAWN_CONTROL",
      payload: {
        id: `lab-${property}`,
        label,
        min: 0,
        max: 1.6,
        step: 0.01,
        value: property === "glow" ? 0.82 : property === "chaos" ? 0.72 : 0.9,
        target: "blob",
        property
      }
    });
    actions.push({
      type: "MOLD_BLOB",
      payload: {
        formation: "sphere",
        targetShape: "organic",
        material: isGlass ? "glass" : "carbon",
        [property]: property === "glow" ? 0.82 : property === "chaos" ? 0.72 : 0.9,
        speed: 2.1
      }
    });
  }

  if (
    wantsSite ||
    wantsNavbar ||
    wantsHeroSection ||
    wantsAboutSection ||
    wantsServices ||
    wantsFeaturesSection ||
    wantsMetrics ||
    wantsTestimonials ||
    wantsPricing ||
    wantsFaq ||
    wantsContactSection ||
    wantsLogoStrip
  ) {
    const archetypeSections: Record<CreativeArchetype, string[]> = {
      "brand-poster": ["NAVBAR", "HERO", "METRICS", "FEATURES", "CONTACT"],
      "service-business": ["NAVBAR", "HERO", "SERVICES", "TESTIMONIALS", "FAQ", "CONTACT", "FOOTER"],
      "creative-portfolio": ["NAVBAR", "HERO", "LOGO_STRIP", "ABOUT", "FEATURES", "CONTACT"],
      "interactive-concept": ["NAVBAR", "HERO", "FEATURES", "METRICS", "CONTACT"],
      "reference-rebuild": ["NAVBAR", "HERO", "ABOUT", "FEATURES", "CONTACT"]
    };
    const requestedSections = [
      wantsNavbar ? "NAVBAR" : null,
      wantsHeroSection ? "HERO" : null,
      wantsAboutSection ? "ABOUT" : null,
      wantsServices ? "SERVICES" : null,
      wantsFeaturesSection ? "FEATURES" : null,
      wantsMetrics ? "METRICS" : null,
      wantsLogoStrip ? "LOGO_STRIP" : null,
      wantsTestimonials ? "TESTIMONIALS" : null,
      wantsPricing ? "PRICING" : null,
      wantsFaq ? "FAQ" : null,
      wantsContactSection ? "CONTACT" : null,
      wantsFooter ? "FOOTER" : null
    ].filter((item): item is string => Boolean(item));
    const sequence = wantsSite
      ? archetypeSections[archetype]
      : requestedSections;

    sequence.forEach((sectionType) =>
      addSection(actions, sectionType, subject, text, archetype, input)
    );
  }

  if (text.includes("publish")) {
    actions.push({ type: "PUBLISH", payload: {} });
  }

  return actions;
}
