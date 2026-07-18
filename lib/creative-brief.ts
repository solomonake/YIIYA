export type BriefIntentType = "LAYOUT" | "SPATIAL" | "STYLE" | "COMMAND";

export type CreativeBrief = {
  archetype:
    | "brand-poster"
    | "service-business"
    | "creative-portfolio"
    | "interactive-concept"
    | "reference-rebuild";
  audience: string;
  palette: string[];
  visualTone: string;
  spatialAssetFamily:
    | "device"
    | "bottle"
    | "vehicle"
    | "furniture"
    | "apparel"
    | "portrait"
    | "pedestal"
    | "abstract";
  confidence: number;
  fallbackPath: "llm" | "heuristic" | "local-compiler";
  proofPoints: string[];
  cta: string;
  locality?: string;
  summary: string;
};

type CreativeBriefInput = {
  transcript: string;
  intent: BriefIntentType;
  creationGoal?: string;
  starterPromptId?: string | null;
  hasReferenceImage?: boolean;
};

const paletteSets = {
  service: ["#06121B", "#F4F7FB", "#1E7EF7", "#0E2238"],
  luxury: ["#050505", "#F2EEE7", "#C6A86A", "#221A0E"],
  playful: ["#12131D", "#F9FAFB", "#EC4899", "#5B4BFF"],
  industrial: ["#080A0B", "#EDEDED", "#EF9F27", "#1B1F21"],
  creative: ["#050505", "#F8F5EF", "#3BE1FF", "#2B2D42"]
} as const;

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

export function inferSpatialAssetFamily(transcript: string): CreativeBrief["spatialAssetFamily"] {
  const text = transcript.toLowerCase();

  if (hasAny(text, ["laptop", "phone", "device", "monitor", "screen"])) {
    return "device";
  }

  if (hasAny(text, ["bottle", "perfume", "drink", "can", "jar", "mug"])) {
    return "bottle";
  }

  if (hasAny(text, ["car", "vehicle", "truck", "bike", "sedan", "suv"])) {
    return "vehicle";
  }

  if (hasAny(text, ["chair", "sofa", "table", "desk", "lamp", "furniture"])) {
    return "furniture";
  }

  if (hasAny(text, ["shoe", "sneaker", "shirt", "hoodie", "bag", "watch"])) {
    return "apparel";
  }

  if (hasAny(text, ["portrait", "head", "bust", "face", "self", "myself"])) {
    return "portrait";
  }

  if (hasAny(text, ["pedestal", "plinth", "platform", "stand"])) {
    return "pedestal";
  }

  return "abstract";
}

function inferArchetype(text: string, hasReferenceImage = false): CreativeBrief["archetype"] {
  if (hasReferenceImage) {
    return "reference-rebuild";
  }

  if (
    hasAny(text, [
      "interactive",
      "concept",
      "crazy",
      "experimental",
      "game",
      "experience",
      "futuristic"
    ])
  ) {
    return "interactive-concept";
  }

  if (
    hasAny(text, [
      "portfolio",
      "studio",
      "artist",
      "agency",
      "creative",
      "fashion",
      "photography"
    ])
  ) {
    return "creative-portfolio";
  }

  if (
    hasAny(text, [
      "plumbing",
      "salon",
      "dentist",
      "law",
      "contractor",
      "clinic",
      "restaurant",
      "atlanta"
    ])
  ) {
    return "service-business";
  }

  return "brand-poster";
}

function inferLocality(text: string) {
  const match = text.match(/\bin\s+([a-z\s]{3,24})/i)?.[1]?.trim();
  return match ? titleCase(match) : undefined;
}

function proofPointsFor(text: string, family: CreativeBrief["spatialAssetFamily"]) {
  if (text.includes("plumbing")) {
    return [
      "Emergency response framing",
      "Service proof and reviews",
      "Local trust markers"
    ];
  }

  if (family === "device") {
    return ["Studio lighting", "Front and angled product views", "Clear feature hierarchy"];
  }

  if (family === "vehicle") {
    return ["Hero silhouette", "Motion posture", "Premium material treatment"];
  }

  return ["Clear hierarchy", "One strong CTA", "Visual object-story fit"];
}

export function heuristicCreativeBrief(input: CreativeBriefInput): CreativeBrief {
  const text = input.transcript.toLowerCase();
  const family = inferSpatialAssetFamily(text);
  const archetype = inferArchetype(text, input.hasReferenceImage);
  const locality = inferLocality(text);

  if (archetype === "service-business") {
    return {
      archetype,
      audience: locality ? `${locality} customers who need trust fast` : "Local customers who need trust fast",
      palette: [...paletteSets.service],
      visualTone: "trust-forward industrial clarity",
      spatialAssetFamily: family === "abstract" ? "pedestal" : family,
      confidence: 0.78,
      fallbackPath: "heuristic",
      proofPoints: proofPointsFor(text, family),
      cta: locality ? `Book service in ${locality}` : "Book service now",
      locality,
      summary: locality
        ? `Build a local-service page with proof, speed, and a matching ${family} object.`
        : `Build a local-service page with proof, speed, and a matching ${family} object.`
    };
  }

  if (archetype === "creative-portfolio") {
    return {
      archetype,
      audience: "Clients who buy taste, clarity, and confidence",
      palette: [...paletteSets.creative],
      visualTone: "editorial contrast with gallery restraint",
      spatialAssetFamily: family,
      confidence: 0.72,
      fallbackPath: "heuristic",
      proofPoints: proofPointsFor(text, family),
      cta: "See selected work",
      locality,
      summary: `Build a restrained portfolio with a hero object and sparse, high-confidence copy.`
    };
  }

  if (input.intent === "SPATIAL") {
    return {
      archetype,
      audience: "People exploring form, mockups, and objects in motion",
      palette: hasAny(text, ["gold", "luxury", "watch"])
        ? [...paletteSets.luxury]
        : [...paletteSets.industrial],
      visualTone: hasAny(text, ["glass", "chrome", "studio"])
        ? "studio-lit product fidelity"
        : "tactile dark-lab exploration",
      spatialAssetFamily: family,
      confidence: 0.75,
      fallbackPath: "heuristic",
      proofPoints: proofPointsFor(text, family),
      cta: "Refine the mockup",
      locality,
      summary: `Create a ${family} object that feels immediate, draggable, and exportable.`
    };
  }

  return {
    archetype,
    audience: "Visitors who decide based on vibe in the first few seconds",
    palette: hasAny(text, ["luxury", "premium", "watch"])
      ? [...paletteSets.luxury]
      : hasAny(text, ["playful", "viral", "bright"])
        ? [...paletteSets.playful]
        : [...paletteSets.industrial],
    visualTone: hasAny(text, ["luxury", "premium", "watch"])
      ? "quiet luxury with a hard silhouette"
      : "dark studio with glowing editorial accents",
    spatialAssetFamily: family,
    confidence: 0.68,
    fallbackPath: "heuristic",
    proofPoints: proofPointsFor(text, family),
    cta: "See the concept",
    locality,
    summary: `Turn the rough prompt into a decisive page and a matching spatial object.`
  };
}
