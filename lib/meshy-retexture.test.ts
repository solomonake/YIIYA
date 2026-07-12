import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildRetexturePayload,
  canRetextureModelUrl,
  mapMeshyTextureUrls,
  MESHY_RETEXTURE_ENDPOINT,
  MESHY_STYLE_PROMPT_MAX,
  retextureCacheKey,
  retextureViaMeshy
} from "./meshy-retexture";

describe("canRetextureModelUrl", () => {
  it("accepts our Blob mirror and provider CDN GLB urls", () => {
    expect(canRetextureModelUrl("https://abc123.public.blob.vercel-storage.com/glb/171-dragon.glb")).toBe(true);
    expect(canRetextureModelUrl("https://assets.meshy.ai/tasks/output/model.glb")).toBe(true);
    expect(canRetextureModelUrl("https://v3.fal.media/files/kangaroo/mesh.glb")).toBe(true);
  });

  it("rejects urls Meshy cannot fetch or we do not trust", () => {
    // relative proxy url — not publicly fetchable
    expect(canRetextureModelUrl("/api/3d/proxy?src=https%3A%2F%2Fx.hf.space%2Ff.glb")).toBe(false);
    // plain http
    expect(canRetextureModelUrl("http://abc.public.blob.vercel-storage.com/a.glb")).toBe(false);
    // host off the allowlist
    expect(canRetextureModelUrl("https://evil.example.com/a.glb")).toBe(false);
    // allowed host but non-mesh file
    expect(canRetextureModelUrl("https://abc.public.blob.vercel-storage.com/ref/photo.jpg")).toBe(false);
    expect(canRetextureModelUrl(undefined)).toBe(false);
    expect(canRetextureModelUrl(null)).toBe(false);
    expect(canRetextureModelUrl("data:model/gltf-binary;base64,AAAA")).toBe(false);
  });

  it("checks the extension against the pathname, not the query string", () => {
    expect(canRetextureModelUrl("https://abc.public.blob.vercel-storage.com/a.glb?download=1")).toBe(true);
    expect(canRetextureModelUrl("https://abc.public.blob.vercel-storage.com/a?name=x.glb")).toBe(false);
  });
});

describe("buildRetexturePayload", () => {
  it("builds the documented request body", () => {
    const p = buildRetexturePayload("https://x.public.blob.vercel-storage.com/a.glb", "make it look more human");
    expect(p).toEqual({
      model_url: "https://x.public.blob.vercel-storage.com/a.glb",
      text_style_prompt: "make it look more human",
      enable_original_uv: false,
      enable_pbr: true,
      ai_model: "latest",
      target_formats: ["glb"]
    });
  });

  it("collapses whitespace and enforces Meshy's 600-char prompt cap", () => {
    const long = "  shiny \n\n chrome   ".repeat(80);
    const p = buildRetexturePayload("https://x.public.blob.vercel-storage.com/a.glb", long);
    expect(p.text_style_prompt.length).toBeLessThanOrEqual(MESHY_STYLE_PROMPT_MAX);
    expect(p.text_style_prompt).not.toMatch(/\s{2,}/);
    expect(p.text_style_prompt.startsWith("shiny chrome")).toBe(true);
  });
});

describe("mapMeshyTextureUrls", () => {
  it("maps Meshy names onto our textureUrls shape", () => {
    expect(
      mapMeshyTextureUrls([
        { base_color: "https://m/b.png", metallic: "https://m/m.png", normal: "https://m/n.png", roughness: "https://m/r.png" }
      ])
    ).toEqual({ albedo: "https://m/b.png", metalness: "https://m/m.png", normal: "https://m/n.png", roughness: "https://m/r.png" });
  });

  it("returns undefined for empty or unusable input", () => {
    expect(mapMeshyTextureUrls(undefined)).toBeUndefined();
    expect(mapMeshyTextureUrls([])).toBeUndefined();
    expect(mapMeshyTextureUrls([{ base_color: 42 }])).toBeUndefined();
  });
});

describe("retextureCacheKey", () => {
  const glbA = "https://x.public.blob.vercel-storage.com/glb/1-dragon.glb";
  const glbB = "https://x.public.blob.vercel-storage.com/glb/2-knight.glb";

  it("is deterministic and scoped to the source mesh", () => {
    expect(retextureCacheKey("make it look more human", glbA)).toBe(retextureCacheKey("make it look more human", glbA));
    expect(retextureCacheKey("make it look more human", glbA)).not.toBe(retextureCacheKey("make it look more human", glbB));
  });

  it("never collides with the plain transcript key", () => {
    expect(retextureCacheKey("make it look more human", glbA)).not.toBe("make it look more human");
    expect(retextureCacheKey("  make it look more human  ", glbA)).toBe(retextureCacheKey("make it look more human", glbA));
  });
});

describe("retextureViaMeshy (mocked fetch)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  const modelUrl = "https://x.public.blob.vercel-storage.com/glb/1-dragon.glb";

  it("fails closed without a task when MESHY_API_KEY is missing", async () => {
    vi.stubEnv("MESHY_API_KEY", "");
    const out = await retextureViaMeshy(modelUrl, "rusty");
    expect(out.url).toBeNull();
    expect(out.taskCreated).toBe(false);
    expect(out.error).toContain("MESHY_API_KEY");
  });

  it("creates a task, polls to SUCCEEDED, and reports consumed credits", async () => {
    vi.stubEnv("MESHY_API_KEY", "test-key");
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (init?.method === "POST") {
        return new Response(JSON.stringify({ result: "task-1" }), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          status: "SUCCEEDED",
          model_urls: { glb: "https://assets.meshy.ai/out/task-1.glb" },
          texture_urls: [{ base_color: "https://assets.meshy.ai/out/base.png" }],
          consumed_credits: 10
        }),
        { status: 200 }
      );
    }));

    const out = await retextureViaMeshy(modelUrl, "make it look more human", { pollIntervalMs: 1 });
    expect(out.url).toBe("https://assets.meshy.ai/out/task-1.glb");
    expect(out.consumedCredits).toBe(10);
    expect(out.taskCreated).toBe(true);
    expect(out.textureUrls).toEqual({
      albedo: "https://assets.meshy.ai/out/base.png",
      metalness: undefined,
      normal: undefined,
      roughness: undefined
    });

    const create = calls[0];
    expect(create.url).toBe(MESHY_RETEXTURE_ENDPOINT);
    expect((create.init?.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
    expect(JSON.parse(create.init?.body as string)).toMatchObject({
      model_url: modelUrl,
      text_style_prompt: "make it look more human"
    });
    expect(calls[1].url).toBe(`${MESHY_RETEXTURE_ENDPOINT}/task-1`);
  });

  it("marks taskCreated on FAILED so the pipeline does not double-spend", async () => {
    vi.stubEnv("MESHY_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return new Response(JSON.stringify({ result: "task-2" }), { status: 200 });
      }
      return new Response(
        JSON.stringify({ status: "FAILED", task_error: { message: "mesh has no surface" } }),
        { status: 200 }
      );
    }));

    const out = await retextureViaMeshy(modelUrl, "rusty", { pollIntervalMs: 1 });
    expect(out.url).toBeNull();
    expect(out.taskCreated).toBe(true);
    expect(out.error).toContain("FAILED");
    expect(out.error).toContain("mesh has no surface");
  });

  it("reports a create rejection without marking a task created", async () => {
    vi.stubEnv("MESHY_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Payment Required", { status: 402 })));

    const out = await retextureViaMeshy(modelUrl, "rusty", { pollIntervalMs: 1 });
    expect(out.url).toBeNull();
    expect(out.taskCreated).toBe(false);
    expect(out.error).toContain("402");
  });
});
