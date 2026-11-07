import { describe, expect, it, vi } from "vitest";
import { normalizeHfToken, resolveHfToken, verifyHfToken } from "./huggingface-access";

describe("Hugging Face access",()=>{
  it("rejects placeholders and header injection without external calls",async()=>{
    const fetcher=vi.fn();
    for(const token of [null,{},"", "your_token_here","hf_...","hf_bad\r\nInjected: yes","hf_", "hf_"+"x".repeat(300)]) {
      expect(normalizeHfToken(token)).toBeUndefined();
      expect(await verifyHfToken(token,fetcher)).toBe("invalid_format");
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("does not silently fall back from an invalid personal token",()=>{
    expect(resolveHfToken("bad-personal", "hf_server")).toBeUndefined();
    expect(resolveHfToken("  ", "hf_server")).toBe("hf_server");
    expect(resolveHfToken(" hf_personal ","hf_server")).toBe("hf_personal");
  });
  it.each([[200,"accepted"],[401,"rejected"],[403,"rejected"],[429,"rate_limited"],[500,"unavailable"]])("classifies HTTP %i without leaking upstream identity",async(status,expected)=>{
    const fetcher=vi.fn().mockResolvedValue(new Response('{"name":"private-user"}',{status:Number(status)}));
    expect(await verifyHfToken("hf_synthetic",fetcher)).toBe(expected);
    expect(fetcher).toHaveBeenCalledWith("https://huggingface.co/api/whoami-v2",expect.objectContaining({redirect:"error",cache:"no-store",method:"GET"}));
  });
  it("reports failed transport without exposing error details",async()=>{
    const fetcher=vi.fn().mockRejectedValue(new Error("hf_secret-must-not-escape"));
    expect(await verifyHfToken("hf_synthetic",fetcher)).toBe("unavailable");
  });
});


describe("HF error privacy", () => {
  it.each([
    new Error("invalid token hf_privateSecret"),
    "quota exceeded for hf_privateSecret",
    { detail: "403 for Bearer hf_privateSecret" },
    { message: "timeout with hf_privateSecret" },
    { request: { authorization: "Bearer hf_privateSecret" } },
    { message: "unexpected response for hf_privateSecret" }
  ])("never echoes upstream request or credential fragments", async error => {
    const { hfFailureMessage } = await import("./huggingface-access");
    const result = hfFailureMessage(error);
    expect(result).not.toContain("hf_privateSecret");
    expect(result).not.toContain("Bearer");
    expect(result).toMatch(/^Hugging Face /);
  });
});
