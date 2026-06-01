/**
 * InstantMesh client — TencentARC InstantMesh via HuggingFace Space.
 *
 * Space:  https://huggingface.co/spaces/TencentARC/InstantMesh
 * Paper:  https://arxiv.org/abs/2404.07191
 * Repo:   https://github.com/TencentARC/InstantMesh
 *
 * Why this provider exists:
 *   - ~10s feed-forward image→mesh (no iterative optimization).
 *   - Mid-quality fallback when Tripo is rate-limited and TRELLIS.2 is slow.
 */
import { Client as GradioClient } from "@gradio/client";
import type { GenerationResult, ProviderClient } from "./types";

const SPACE = process.env.INSTANTMESH_SPACE ?? "TencentARC/InstantMesh";
const HF_TOKEN = process.env.HUGGINGFACE_TOKEN;

export const instantmeshHf: ProviderClient = {
  name: "instantmesh-hf",

  supports(kind) {
    return kind === "image-to-3d";
  },

  async generate(request, signal): Promise<GenerationResult> {
    if (!request.imageUrl && !request.imageBase64) {
      throw new Error("instantmesh-hf requires an image");
    }
    const started = Date.now();
    const client = await GradioClient.connect(SPACE, {
      hf_token: HF_TOKEN as `hf_${string}` | undefined
    });

    const imageBlob = request.imageBase64
      ? new Blob([Uint8Array.from(Buffer.from(request.imageBase64, "base64"))], {
          type: request.imageMime ?? "image/png"
        })
      : await (await fetch(request.imageUrl!, { signal })).blob();

    const abortPromise = new Promise<never>((_, reject) => {
      signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    });

    // The InstantMesh space typically exposes /generate_mvs then /make3d.
    const mvs = (await Promise.race([
      client.predict("/generate_mvs", [imageBlob, request.seed ?? 42, 75]),
      abortPromise
    ])) as { data: unknown[] };

    const meshes = (await Promise.race([
      client.predict("/make3d", [mvs.data?.[0]]),
      abortPromise
    ])) as { data: Array<{ url?: string; path?: string; name?: string }> };

    const glb = meshes.data?.find((m) => (m.name ?? m.path ?? "").endsWith(".glb"));
    if (!glb || !(glb.url ?? glb.path)) {
      throw new Error("instantmesh-hf returned no GLB");
    }
    return {
      provider: "instantmesh-hf",
      glbUrl: glb.url ?? glb.path!,
      latencyMs: Date.now() - started,
      cost: { provider: "instantmesh-hf", usd: 0 },
      meta: { space: SPACE }
    };
  }
};
