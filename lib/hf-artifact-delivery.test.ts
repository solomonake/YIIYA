import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { afterEach, expect, it, vi } from "vitest";
import { GET as proxy } from "@/app/api/3d/proxy/route";
import { GET as convert } from "@/app/api/3d/convert/route";

const source = "https://stabilityai-stable-fast-3d.hf.space/gradio_api/file=model.glb";
const proxyUrl = "/api/3d/proxy?src=" + encodeURIComponent(source);
const model = readFileSync(process.env.YIIYA_TEST_GLB_PATH || "public/models/dinoring-reconstructed.glb");
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it.each(["proxy", "glb", "stl", "obj"])("delivers the generating visitor's private artifact as %s", async format => {
  vi.stubEnv("HUGGINGFACE_TOKEN", "hf_otherAccount");
  vi.stubGlobal("fetch", vi.fn(async (url, init) => {
    expect(url).toBe(source);
    expect(init.redirect).toBe("error");
    return new Headers(init.headers).get("authorization") === "Bearer hf_testOwner"
      ? new Response(new Uint8Array(model)) : new Response("forbidden", { status: 403 });
  }));
  const route = format === "proxy" ? proxyUrl : "/api/3d/convert?from=" + encodeURIComponent(proxyUrl) + "&to=" + format;
  const req = new NextRequest(new URL(route, "https://yiiya.example"), { headers: { "x-yiiya-hf-token": "hf_testOwner" } });
  const response = await (format === "proxy" ? proxy : convert)(req);
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toContain("no-store");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (format === "proxy" || format === "glb") expect(bytes.equals(model)).toBe(true);
  else expect(Number(response.headers.get("x-yiiya-triangles"))).toBeGreaterThan(0);
});

it("never attaches a browser credential to an external request or unrelated route", async () => {
  const { personalArtifactRequest } = await import("./hf-artifact-request");
  for (const path of [source, "https://attacker.example" + proxyUrl, "//attacker.example" + proxyUrl,
    "/api/status", "/api/3d/proxy?src=https://unrelated.hf.space/a.glb",
    "/api/3d/convert?from=" + encodeURIComponent("https://attacker.example/file"),
    "/api/3d/proxy?src=https://stabilityai-stable-fast-3d.hf.space.attacker.example/model.glb"]) {
    expect(personalArtifactRequest(path, "hf_testOwner")).toBeUndefined();
  }
  expect(personalArtifactRequest(proxyUrl, "")).toBeUndefined();
  const init = personalArtifactRequest(proxyUrl, "hf_testOwner");
  expect(init).toMatchObject({ mode: "same-origin", redirect: "error", cache: "no-store" });
  expect(new Headers(init?.headers).get("x-yiiya-hf-token")).toBe("hf_testOwner");
  const converter = "/api/3d/convert?from=" + encodeURIComponent(proxyUrl) + "&to=stl";
  expect(personalArtifactRequest(converter, "hf_testOwner")).toEqual(init);
});

it("rejects malformed credentials before calling a provider", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const req = new NextRequest(new URL(proxyUrl, "https://yiiya.example"), { headers: { "x-yiiya-hf-token": "invalid" } });
  expect((await proxy(req)).status).toBe(400);
  expect(fetcher).not.toHaveBeenCalled();
});

it("delivers a private texture edit from the studio's configured texture Space", async () => {
  const { personalArtifactRequest } = await import("./hf-artifact-request");
  const { providerAuthHeaders } = await import("./provider-hosts");
  const src = "https://horizonrobotics-embodiedgen-texture-gen.hf.space/gradio_api/file=restyled.glb";
  const path = "/api/3d/proxy?src=" + encodeURIComponent(src);
  expect(personalArtifactRequest(path, "hf_testOwner")).toBeDefined();
  expect(providerAuthHeaders(src, "hf_testOwner")).toEqual({ Authorization: "Bearer hf_testOwner" });
});
