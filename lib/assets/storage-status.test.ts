import { describe, expect, it } from "vitest";
import { assetStorageStatus } from "./storage-status";

describe("asset storage provenance", () => {
  it("recognizes mirrored public Blob artifacts", () => {
    expect(assetStorageStatus("https://store.public.blob.vercel-storage.com/glb/model.glb")).toBe("mirrored");
  });
  it.each([
    "/api/3d/proxy?src=https%3A%2F%2Fexample.hf.space%2Fmodel.glb",
    "https://yiiya.vercel.app/api/3d/proxy?src=example",
    "https://microsoft-trellis-2.hf.space/gradio_api/file=model.glb"
  ])("does not mistake a proxy or Space for persistence: %s", (url) => {
    expect(assetStorageStatus(url)).toBe("temporary");
  });
  it.each([
    "https://store.public.blob.vercel-storage.com.attacker.test/model.glb",
    "http://store.public.blob.vercel-storage.com/model.glb",
    "https://token@store.public.blob.vercel-storage.com/model.glb",
    "https://store.public.blob.vercel-storage.com:444/model.glb",
    "https://unknown.example/model.glb",
    "/api/3d/placeholder"
  ])("leaves persistence unverified for %s", (url) => {
    expect(assetStorageStatus(url)).toBe("unknown");
  });
});
