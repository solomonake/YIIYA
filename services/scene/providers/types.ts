/**
 * Shared types for 3D-generation providers.
 */
export type ProviderName = "trellis2-hf" | "tripo" | "instantmesh-hf" | "sparc3d-hf" | "fal-trellis2";

export type GenerationKind = "text-to-3d" | "image-to-3d";

export type GenerationRequest = {
  kind: GenerationKind;
  prompt?: string;
  imageUrl?: string;
  imageBase64?: string;     // For HF Spaces — sometimes simpler than uploading a URL.
  imageMime?: string;
  intent: "preview" | "final";
  // Wall-clock budget. The router will pick the tier most likely to succeed in budget.
  budgetMs?: number;
  seed?: number;
  // Quality knobs (provider-specific; ignored if unsupported).
  pbr?: boolean;            // Request PBR materials (TRELLIS.2 supports; others ignore).
  transparency?: boolean;
  // Identity for usage metering.
  userId?: string | null;
  sessionId?: string | null;
  traceId?: string | null;
};

export type GenerationResult = {
  provider: ProviderName;
  glbUrl: string;            // Public HTTPS URL of the generated GLB.
  thumbnailUrl?: string;
  latencyMs: number;
  cost: { provider: ProviderName; usd: number };
  meta: Record<string, unknown>;
};

export type GenerationError = {
  provider: ProviderName;
  code: "timeout" | "rate_limited" | "unavailable" | "moderated" | "invalid_input" | "unknown";
  message: string;
  retryAfterMs?: number;
};

export type ProviderClient = {
  name: ProviderName;
  supports(kind: GenerationKind): boolean;
  generate(request: GenerationRequest, signal: AbortSignal): Promise<GenerationResult>;
};
