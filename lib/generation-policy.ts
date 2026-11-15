/** Server-only 3D routing. Missing/unknown modes fail closed to HF Spaces.
 * This does not control the HF account's own billing or other AI/storage costs.
 */
export type GenerationMode = "free-only" | "mixed";
type Environment = Record<string, string | undefined>;

export function generationMode(env: Environment = process.env): GenerationMode {
  return env.YIIYA_3D_MODE === "mixed" ? "mixed" : "free-only";
}

const HF_PROVIDER_ORDER = [
  "hf-trellis2", "hf-hunyuan", "hf-trellis", "hf-stablefast", "hf-instantmesh"
];

// Legacy mixed-mode default. Requires explicit commercial-provider opt-in.
const DEFAULT_PROVIDER_ORDER = [
  "fal-hunyuan-mv",
  "fal-hunyuan",
  "fal-trellis",
  "fal-rodin",
  "tripo",
  "meshy",
  "hf-trellis2",
  "hf-trellis",
  "hf-hunyuan",
  "hf-stablefast",
  "hf-instantmesh"
];

// Legacy mixed-mode ordering only. This is NOT a zero-spend guarantee:
// multi-view can call fal first and commercial fallbacks remain eligible.
const FREE_FIRST_PROVIDER_ORDER = [
  "fal-hunyuan-mv",
  "hf-trellis2",
  "hf-hunyuan",
  "tripo",
  "meshy",
  "hf-trellis",
  "hf-stablefast",
  "hf-instantmesh",
  "fal-hunyuan",
  "fal-trellis",
  "fal-rodin"
];

// Legacy mixed-mode face routing. Kept for explicit opt-in, not a quality claim.
const PERSON_PROVIDER_ORDER = [
  "fal-hunyuan-mv",
  "fal-rodin",
  "fal-trellis",
  "hf-trellis2",
  "fal-hunyuan",
  "tripo",
  "meshy",
  "hf-hunyuan"
];

export function providerOrder(person: boolean, env: Environment = process.env): string[] {
  const explicit = env.YIIYA_PROVIDER_ORDER?.split(",").map(s => s.trim()).filter(Boolean);
  if (generationMode(env) === "free-only") {
    // Explicit orders can narrow/reorder HF choices, never introduce paid calls.
    return Array.from(new Set(explicit?.length
      ? explicit.filter(key => HF_PROVIDER_ORDER.includes(key))
      : HF_PROVIDER_ORDER));
  }
  const freeFirst = env.YIIYA_FREE_FIRST === "1" || env.YIIYA_FREE_FIRST === "true";
  return Array.from(new Set(explicit?.length ? explicit
    : person ? PERSON_PROVIDER_ORDER
    : freeFirst ? FREE_FIRST_PROVIDER_ORDER : DEFAULT_PROVIDER_ORDER));
}
