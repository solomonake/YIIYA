/**
 * TRELLIS.2 client — Microsoft TRELLIS.2-4B via HuggingFace Space.
 *
 * Space:        https://huggingface.co/spaces/microsoft/TRELLIS.2
 * Paper:        https://arxiv.org/abs/2412.01506 (TRELLIS) + TRELLIS.2 follow-up
 * Repo:         https://github.com/microsoft/TRELLIS.2
 *
 * Why this provider exists:
 *   - First open model that emits correct PBR + transparency + opacity maps.
 *   - 3-second median inference on the HF Space (free).
 *   - Image-to-3D only — for text input, route prompts through Tripo or
 *     synthesize a reference image first.
 *
 * Protocol notes:
 *   The HF Space exposes a Gradio API. We use the /gradio_api/call/predict
 *   endpoint + the corresponding /call/predict/{event_id} polling endpoint.
 *   Gradio docs: https://www.gradio.app/guides/querying-gradio-apps-with-curl
 */
import { Client as GradioClient } from "@gradio/client";
import type { GenerationRequest, GenerationResult, ProviderClient } from "./types";

const SPACE = process.env.TRELLIS2_SPACE ?? "microsoft/TRELLIS.2";
const HF_TOKEN = process.env.HUGGINGFACE_TOKEN;

export const trellis2Hf: ProviderClient = {
  name: "trellis2-hf",

  supports(kind) {
    return kind === "image-to-3d";
  },

  async generate(request, signal): Promise<GenerationResult> {
    if (request.kind !== "image-to-3d") {
      throw new Error("trellis2-hf only supports image-to-3d");
    }
    if (!request.imageUrl && !request.imageBase64) {
      throw new Error("trellis2-hf requires an image (imageUrl or imageBase64)");
    }

    const started = Date.now();
    const client = await GradioClient.connect(SPACE, {
      hf_token: HF_TOKEN as `hf_${string}` | undefined
    });

    // Convert imageBase64 → Blob if needed; otherwise fetch the URL.
    const imageBlob = request.imageBase64
      ? base64ToBlob(request.imageBase64, request.imageMime ?? "image/png")
      : await fetchAsBlob(request.imageUrl!, signal);

    // Listen for cancellation.
    const abortPromise = new Promise<never>((_, reject) => {
      signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    });

    // The TRELLIS.2 space exposes two predict endpoints typically:
    //   /preprocess_image  (returns the cleaned image)
    //   /image_to_3d       (returns mesh + texture)
    // We call them in sequence. If the upstream space renames endpoints,
    // adjust here.
    const preprocessed = (await Promise.race([
      client.predict("/preprocess_image", [imageBlob]),
      abortPromise
    ])) as { data: unknown[] };

    const result = (await Promise.race([
      client.predict("/image_to_3d", {
        image: preprocessed.data?.[0] as Blob,
        seed: request.seed ?? Math.floor(Math.random() * 1_000_000),
        ss_guidance_strength: 7.5,
        ss_sampling_steps: 12,
        slat_guidance_strength: 3,
        slat_sampling_steps: 12,
        multiimage_algo: "stochastic",
        // PBR/transparency knobs — supported by TRELLIS.2 endpoints.
        pbr: request.pbr ?? true,
        transparent: request.transparency ?? false
      }),
      abortPromise
    ])) as { data: Array<{ url?: string; path?: string; name?: string }> };

    const glb = result.data?.find((d) => (d.name ?? d.path ?? "").endsWith(".glb"));
    if (!glb || !(glb.url ?? glb.path)) {
      throw new Error("trellis2-hf returned no GLB asset");
    }

    return {
      provider: "trellis2-hf",
      glbUrl: glb.url ?? glb.path!,
      latencyMs: Date.now() - started,
      cost: { provider: "trellis2-hf", usd: 0 },
      meta: { space: SPACE, pbr: request.pbr ?? true }
    };
  }
};

function base64ToBlob(b64: string, mime: string): Blob {
  const bytes = Uint8Array.from(Buffer.from(b64, "base64"));
  return new Blob([bytes], { type: mime });
}

async function fetchAsBlob(url: string, signal: AbortSignal): Promise<Blob> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`fetch image failed: ${res.status}`);
  return res.blob();
}
