import { describe, expect, it } from "vitest";

import { isAllowedProviderUrl, providerAuthHeaders } from "./provider-hosts";

describe("isAllowedProviderUrl", () => {
  it("allows HuggingFace Space gradio file URLs", () => {
    expect(
      isAllowedProviderUrl(
        "https://tencentarc-instantmesh.hf.space/gradio_api/file=/tmp/gradio/abc/model.glb"
      )
    ).toBe(true);
  });

  it("allows fal, tripo, meshy, pollinations and vercel blob hosts", () => {
    expect(isAllowedProviderUrl("https://v3.fal.media/files/x/model.glb")).toBe(true);
    expect(isAllowedProviderUrl("https://tripo-data.tripo3d.ai/x.glb")).toBe(true);
    expect(isAllowedProviderUrl("https://assets.meshy.ai/x/model.glb")).toBe(true);
    expect(isAllowedProviderUrl("https://image.pollinations.ai/prompt/apple")).toBe(true);
    expect(isAllowedProviderUrl("https://abc123.public.blob.vercel-storage.com/glb/x.glb")).toBe(true);
  });

  it("rejects SSRF attempts", () => {
    expect(isAllowedProviderUrl("http://tencentarc-instantmesh.hf.space/x.glb")).toBe(false); // http
    expect(isAllowedProviderUrl("https://evil.com/x.glb")).toBe(false);
    expect(isAllowedProviderUrl("https://hf.space/x.glb")).toBe(false); // bare suffix, no subdomain
    expect(isAllowedProviderUrl("https://evilhf.space/x.glb")).toBe(false);
    expect(isAllowedProviderUrl("https://169.254.169.254/latest/meta-data")).toBe(false);
    expect(isAllowedProviderUrl("file:///etc/passwd")).toBe(false);
    expect(isAllowedProviderUrl("not a url")).toBe(false);
  });
});

describe("providerAuthHeaders", () => {
  it("attaches the HF token only for hf.space hosts", () => {
    const prev = process.env.HUGGINGFACE_TOKEN;
    process.env.HUGGINGFACE_TOKEN = "hf_test_token";
    try {
      expect(providerAuthHeaders("https://x-y.hf.space/file=/tmp/a.glb")).toEqual({
        Authorization: "Bearer hf_test_token"
      });
      expect(providerAuthHeaders("https://assets.meshy.ai/a.glb")).toEqual({});
    } finally {
      if (prev === undefined) delete process.env.HUGGINGFACE_TOKEN;
      else process.env.HUGGINGFACE_TOKEN = prev;
    }
  });
});
