import { describe, expect, it } from "vitest";
import { buildExportUrls } from "./export-urls";

describe("buildExportUrls", () => {
  it("returns glb/obj/stl links for a real GLB URL", () => {
    const urls = buildExportUrls("https://blob.example.com/asset.glb");
    expect(urls.glb).toBe("https://blob.example.com/asset.glb");
    expect(urls.obj).toBe(
      `/api/3d/convert?from=${encodeURIComponent("https://blob.example.com/asset.glb")}&to=obj`
    );
    expect(urls.stl).toContain("&to=stl");
    expect(urls.usd).toBeUndefined();
  });

  it("includes usd only when a converter is configured", () => {
    const urls = buildExportUrls("https://blob.example.com/asset.glb", { usdzConfigured: true });
    expect(urls.usd).toContain("&to=usdz");
  });

  it("returns no exports for placeholder or empty URLs", () => {
    expect(buildExportUrls("/api/3d/placeholder?name=cup")).toEqual({});
    expect(buildExportUrls("")).toEqual({});
  });
});
