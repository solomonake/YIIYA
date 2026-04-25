export type CreationPathway = {
  id: string;
  label: string;
  mode: "WEB" | "3D" | "HYBRID";
  subtitle: string;
  prompt: string;
  creationGoal: "web" | "spatial" | "scan";
};

export const creationPathways: CreationPathway[] = [
  {
    id: "path-web-hotel",
    label: "Web",
    mode: "HYBRID",
    subtitle: "Turn one rough sentence into a strong landing page.",
    prompt: "Build a sleek obsidian landing page for a boutique hotel in Tokyo with one sculptural 3D hero object.",
    creationGoal: "web"
  },
  {
    id: "path-3d-watch",
    label: "3D",
    mode: "3D",
    subtitle: "Start with a spoken object and refine it fast.",
    prompt: "Create a matte-black luxury watch mockup with chrome edges and studio lighting.",
    creationGoal: "spatial"
  },
  {
    id: "path-scan-desk",
    label: "Scan",
    mode: "3D",
    subtitle: "Use your phone to capture a real object, then polish it into the studio.",
    prompt: "Scan an object from my desk and turn it into a polished 3D mockup.",
    creationGoal: "scan"
  }
];

export const rotatingStarterPrompts = [
  "Try: build a trust-first Atlanta plumbing page",
  "Try: create a chrome laptop mockup",
  "Try: make a glass bottle and export it",
  "Try: scan my desk object from phone",
  "Try: build a cinematic portfolio with one floating object"
];
