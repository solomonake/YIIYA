import { describe, it, expect, vi } from "vitest";
import {
  RETEXTURE_SPACE,
  buildRetexturePrompt,
  extractMeshUrl,
  geometryKept,
  resolveSourceMeshUrl,
  retextureCacheKey,
  retextureViaHuggingFace
} from "./hf-retexture";

const BLOB_GLB = "https://abc123.public.blob.vercel-storage.com/glb/lamp-1.glb";

describe("resolveSourceMeshUrl — SSRF guard for the client-supplied mesh URL", () => {
  it("accepts our Blob mirror and HF Space file URLs", () => {
    expect(resolveSourceMeshUrl(BLOB_GLB)).toBe(BLOB_GLB);
    const space = "https://user-space.hf.space/gradio_api/file=/tmp/gradio/x/mesh.glb";
    expect(resolveSourceMeshUrl(space)).toBe(space);
  });

  it("unwraps our own proxy form to the allowlisted source", () => {
    const inner = "https://user-space.hf.space/gradio_api/file=/tmp/a/model.glb";
    expect(resolveSourceMeshUrl(`/api/3d/proxy?src=${encodeURIComponent(inner)}`)).toBe(inner);
  });

  it("rejects unknown hosts, http, data URIs, placeholders and non-mesh files", () => {
    expect(resolveSourceMeshUrl("https://evil.example.com/a.glb")).toBeNull();
    expect(resolveSourceMeshUrl("http://abc.public.blob.vercel-storage.com/a.glb")).toBeNull();
    expect(resolveSourceMeshUrl("data:model/gltf-binary;base64,AAAA")).toBeNull();
    expect(resolveSourceMeshUrl("/api/3d/placeholder")).toBeNull();
    expect(resolveSourceMeshUrl("https://abc.public.blob.vercel-storage.com/ref/photo.png")).toBeNull();
    expect(resolveSourceMeshUrl(`/api/3d/proxy?src=${encodeURIComponent("https://evil.example.com/a.glb")}`)).toBeNull();
    expect(resolveSourceMeshUrl(undefined)).toBeNull();
  });
});

describe("buildRetexturePrompt", () => {
  it("drops the edit opener and adds the object for context", () => {
    expect(buildRetexturePrompt("Make it look like walnut wood.", "desk lamp")).toBe("desk lamp, look like walnut wood");
  });

  it("caps length", () => {
    expect(buildRetexturePrompt("make it " + "marble ".repeat(100)).length).toBeLessThanOrEqual(300);
  });
});

describe("retextureCacheKey", () => {
  it("scopes the same phrase to different meshes", () => {
    expect(retextureCacheKey("make it walnut", BLOB_GLB)).not.toBe(retextureCacheKey("make it walnut", BLOB_GLB + "?v=2"));
    expect(retextureCacheKey(" make it walnut ", BLOB_GLB)).toBe(retextureCacheKey("make it walnut", BLOB_GLB));
  });
});

describe("geometryKept", () => {
  it("is true when triangle count and size match", () => {
    expect(geometryKept({ triangles: 10_000, maxDimension: 0.4 }, { triangles: 10_200, maxDimension: 0.41 })).toBe(true);
  });
  it("is false when the mesh was simplified or rescaled", () => {
    expect(geometryKept({ triangles: 10_000, maxDimension: 0.4 }, { triangles: 5_000, maxDimension: 0.4 })).toBe(false);
    expect(geometryKept({ triangles: 10_000, maxDimension: 0.4 }, { triangles: 10_000, maxDimension: 1 })).toBe(false);
  });
  it("is unknown without counts", () => {
    expect(geometryKept({}, { triangles: 5 })).toBeNull();
  });
});

describe("extractMeshUrl", () => {
  it("reads Model3d / FileData shapes", () => {
    expect(extractMeshUrl([{ url: "https://s.hf.space/file=/tmp/out.glb" }, "log", null])).toBe("https://s.hf.space/file=/tmp/out.glb");
    expect(extractMeshUrl(["https://s.hf.space/file=/tmp/out.obj"])).toBe("https://s.hf.space/file=/tmp/out.obj");
    expect(extractMeshUrl([{ path: "/tmp/x.png" }])).toBeNull();
  });
});

function fakeClient(results: Record<string, unknown>) {
  const calls: Array<[string, Record<string, unknown>]> = [];
  const client = {
    predict: vi.fn(async (endpoint: string, payload: Record<string, unknown>) => {
      calls.push([endpoint, payload]);
      const r = results[endpoint];
      if (r instanceof Error) throw r;
      return { data: r ?? [] };
    })
  };
  return { client, calls };
}

const meshBlob = () => Promise.resolve(new Blob([new Uint8Array([1, 2, 3])], { type: "model/gltf-binary" }));
const sample = (n: number) => ({ url: `https://s.hf.space/file=/tmp/sample${n}.png` });

describe("retextureViaHuggingFace", () => {
  it("runs the five Space steps in order on one session and never simplifies the mesh", async () => {
    const { client, calls } = fakeClient({
      "/generate_texture_mvimages": [sample(1), sample(2), sample(3)],
      "/get_selected_image": [sample(1)],
      "/backproject_texture_v2": [{ url: "https://s.hf.space/file=/tmp/textured.glb" }, "ok", null]
    });
    const connect = vi.fn(async () => client);
    const out = await retextureViaHuggingFace(BLOB_GLB, "desk lamp, walnut", { token: "hf_test" }, { connect, fetchMesh: meshBlob });

    expect(connect).toHaveBeenCalledWith(RETEXTURE_SPACE, "hf_test");
    expect(calls.map(([e]) => e)).toEqual([
      "/start_session",
      "/generate_condition",
      "/generate_texture_mvimages",
      "/get_selected_image",
      "/backproject_texture_v2"
    ]);
    expect(calls[2][1].prompt).toBe("desk lamp, walnut");
    expect(calls[4][1].fix_mesh).toBe(false);
    expect(calls[4][1].input_image).toEqual(sample(1));
    expect(out).toEqual({ url: "https://s.hf.space/file=/tmp/textured.glb", started: true, error: null });
  });

  it("fails without a token and without contacting the Space", async () => {
    const prev = process.env.HUGGINGFACE_TOKEN;
    delete process.env.HUGGINGFACE_TOKEN;
    const connect = vi.fn();
    const out = await retextureViaHuggingFace(BLOB_GLB, "x", {}, { connect, fetchMesh: meshBlob });
    if (prev !== undefined) process.env.HUGGINGFACE_TOKEN = prev;
    expect(out.url).toBeNull();
    expect(out.started).toBe(false);
    expect(connect).not.toHaveBeenCalled();
  });

  it("reports an unreadable source mesh before starting", async () => {
    const connect = vi.fn();
    const out = await retextureViaHuggingFace(BLOB_GLB, "x", { token: "hf_t" }, { connect, fetchMesh: async () => null });
    expect(out.started).toBe(false);
    expect(out.error).toMatch(/current mesh/);
    expect(connect).not.toHaveBeenCalled();
  });

  it("surfaces quota errors as started failures (gradio rejects with plain objects)", async () => {
    const { client } = fakeClient({ "/generate_texture_mvimages": Object.assign(new Error("You have exceeded your GPU quota"), {}) });
    const out = await retextureViaHuggingFace(BLOB_GLB, "x", { token: "hf_t" }, { connect: async () => client, fetchMesh: meshBlob });
    expect(out.url).toBeNull();
    expect(out.started).toBe(true);
    expect(out.error).toMatch(/quota/);
  });

  it("rejects a non-GLB result rather than mislabelling it", async () => {
    const { client } = fakeClient({
      "/generate_texture_mvimages": [sample(1)],
      "/get_selected_image": [sample(1)],
      "/backproject_texture_v2": ["https://s.hf.space/file=/tmp/textured.obj"]
    });
    const out = await retextureViaHuggingFace(BLOB_GLB, "x", { token: "hf_t" }, { connect: async () => client, fetchMesh: meshBlob });
    expect(out.url).toBeNull();
    expect(out.error).toMatch(/non-GLB/);
  });
});
