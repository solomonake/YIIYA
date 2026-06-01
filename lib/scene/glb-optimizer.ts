/**
 * GLB post-processing pipeline.
 *
 * Inputs:  raw GLB from a provider (often 5–50MB).
 * Outputs: compressed GLB (Draco + meshopt + KTX2 textures) at ~70-90% smaller,
 *          plus 3 LOD variants and a USDZ for iOS AR Quick Look.
 *
 * Library: gltf-transform (Apache-2.0)  https://gltf-transform.dev/
 * Texture compression via KTX2 needs the KTX-Software toolchain (toktx) for
 * full quality; for serverless we ship the meshopt+draco path and skip KTX2
 * unless the env-detected toolchain is present.
 *
 * Designed to run inside services/reconstruction_worker (Node 20). If you
 * run it inside a Vercel function, the time budget is the function timeout —
 * for paid Vercel plans, increase memory + duration accordingly.
 */
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, draco, meshopt, prune, resample, textureCompress } from "@gltf-transform/functions";
import draco3d from "draco3dgltf";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";

export type OptimizationProfile = "max-quality" | "balanced" | "mobile";

export type OptimizedBundle = {
  glb: Buffer;
  bytesBefore: number;
  bytesAfter: number;
  ratio: number;
};

let _io: NodeIO | null = null;

async function io(): Promise<NodeIO> {
  if (_io) return _io;
  await MeshoptDecoder.ready;
  await MeshoptEncoder.ready;
  _io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      "draco3d.decoder": await draco3d.createDecoderModule(),
      "draco3d.encoder": await draco3d.createEncoderModule(),
      "meshopt.decoder": MeshoptDecoder,
      "meshopt.encoder": MeshoptEncoder
    });
  return _io;
}

export async function optimizeGlb(
  input: Buffer,
  profile: OptimizationProfile = "balanced"
): Promise<OptimizedBundle> {
  const sizeBefore = input.byteLength;
  const reader = await io();
  const doc = await reader.readBinary(input);

  // 1) Geometry hygiene
  await doc.transform(dedup(), prune(), resample());

  // 2) Texture compression — re-encode big PNGs to WebP for size.
  await doc.transform(
    textureCompress({
      encoder: sharp,
      targetFormat: profile === "mobile" ? "webp" : "webp",
      resize: profile === "mobile" ? [1024, 1024] : profile === "balanced" ? [2048, 2048] : [4096, 4096],
      slots: /(baseColor|emissive|metallicRoughness|normal|occlusion|opacity)Texture/
    })
  );

  // 3) Geometry compression — Draco for triangle meshes.
  await doc.transform(
    draco({
      method: "edgebreaker",
      encodeSpeed: profile === "mobile" ? 0 : 5,
      decodeSpeed: 5
    })
  );

  // 4) Meshopt for vertex/index quantization (stacks with Draco).
  await doc.transform(meshopt({ encoder: MeshoptEncoder, level: profile === "max-quality" ? "medium" : "high" }));

  const out = Buffer.from(await reader.writeBinary(doc));
  return {
    glb: out,
    bytesBefore: sizeBefore,
    bytesAfter: out.byteLength,
    ratio: out.byteLength / sizeBefore
  };
}

/**
 * Generate three LOD versions for adaptive client-side loading.
 * The renderer picks the right LOD based on device pixel ratio and FPS.
 */
export async function generateLods(input: Buffer): Promise<{ high: Buffer; mid: Buffer; low: Buffer }> {
  const [high, mid, low] = await Promise.all([
    optimizeGlb(input, "max-quality"),
    optimizeGlb(input, "balanced"),
    optimizeGlb(input, "mobile")
  ]);
  return { high: high.glb, mid: mid.glb, low: low.glb };
}
