import type { AssetLane } from "@/lib/asset-compiler";

export type CreationPathway = {
  id: string;
  label: string;
  mode: "WEB" | "3D" | "HYBRID";
  lane: AssetLane;
  subtitle: string;
  prompt: string;
  creationGoal: "web" | "spatial" | "scan";
};

export const creationPathways: CreationPathway[] = [
  {
    id: "path-web-hotel",
    label: "Web",
    mode: "WEB",
    lane: "mesh",
    subtitle: "URL, screenshot, or one rough sentence into a strong landing page.",
    prompt: "Build a sleek obsidian landing page for a boutique hotel in Tokyo with a premium editorial layout and no 3D object.",
    creationGoal: "web"
  },
  {
    id: "path-3d-watch",
    label: "3D",
    mode: "3D",
    lane: "mesh",
    subtitle: "Start with a spoken object and refine it fast.",
    prompt: "Create a matte-black luxury watch mockup with chrome edges and studio lighting.",
    creationGoal: "spatial"
  },
  {
    id: "path-scan-desk",
    label: "Scan",
    mode: "3D",
    lane: "scan",
    subtitle: "Use your phone to capture a real object, then polish it into the studio.",
    prompt: "Scan an object from my desk and turn it into a polished 3D mockup.",
    creationGoal: "scan"
  },
  {
    id: "path-power-watch",
    label: "Power",
    mode: "HYBRID",
    lane: "mesh",
    subtitle: "Merge a kinetic website with a live 3D hero.",
    prompt: "Build a kinetic luxury product page with a floating matte-black watch hero, scroll-reactive sections, and dramatic studio lighting.",
    creationGoal: "web"
  }
];

export const rotatingStarterPrompts = [
  "Try: build a trust-first Atlanta plumbing page",
  "Try: create a chrome laptop mockup",
  "Try: make a glass bottle and export it",
  "Try: scan my desk object from phone",
  "Try: build a cinematic portfolio with one floating object",
  "Try: build a luxury watch page with a moving 3D hero"
];
