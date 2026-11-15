/** Server-only generation identity. Persist only the digest, never source images or keys. */
import { createHash } from "node:crypto";
import type { InterpretRequestBody } from "../interpret-pipeline";
import { generationMode, providerOrder } from "../generation-policy";

// Bump when generation semantics/defaults change. Remote model changes still
// require a recorded version update; this is not automatic provider discovery.
export const GENERATION_CACHE_VERSION = "request-v3-sf3d-restyle";
const publicSettings = ["TRELLIS2_SPACE", "FAL_TEXTURE_SIZE", "FAL_HUNYUAN_OCTREE",
  "FAL_HUNYUAN_STEPS", "FAL_TRELLIS_MODEL", "FAL_HUNYUAN_MODEL", "FAL_HUNYUAN_MV_MODEL",
  "FAL_RODIN_MODEL", "FAL_ENABLE_RODIN", "TRIPO_MODEL_VERSION"] as const;

function canonical(value: unknown, depth = 0): unknown {
  if (depth > 24) throw new Error("Cache input nesting limit");
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) return value.map(item => canonical(item, depth + 1));
  if (typeof value === "object") return Object.fromEntries(Object.keys(value).sort()
    .map(key => [key, canonical((value as Record<string, unknown>)[key], depth + 1)]));
  if (["string", "boolean", "number"].includes(typeof value)) return value;
  throw new Error("Unsupported cache input");
}

export function generationCacheKey(
  body: InterpretRequestBody,
  env: Record<string, string | undefined> = process.env,
  version = GENERATION_CACHE_VERSION
): string | null {
  try {
    const image = body.referenceImage;
    const keyInput = {
      version, mode: generationMode(env), order: [providerOrder(false, env), providerOrder(true, env)],
      settings: Object.fromEntries(publicSettings.map(key => [key, env[key] ?? null])),
      transcript: body.transcript.trim(),
      // File names and personal/server tokens are not generation content.
      image: image ? { base64: image.base64, mediaType: image.mediaType,
        additionalViews: image.additionalViews ?? [] } : null,
      restyleSource: body.editMode === "restyle" ? body.activeAssetGlbUrl ?? "" : null,
      style: body.sessionStyleDNA ?? null,
      history: body.history ?? [], existingAssets: body.existingAssets ?? []
    };
    return createHash("sha256").update(JSON.stringify(canonical(keyInput))).digest("hex");
  } catch { return null; } // Unkeyable input must miss, never collide with a default key.
}
