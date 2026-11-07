import { describe, expect, it } from "vitest";
import { MAX_REFERENCE_BYTES, ReferenceInputSchema } from "./reference-input";
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const image = { name: "mug.png", mediaType: "image/png", base64: png.toString("base64") };

describe("reference photo preflight (signature check, not full decoding)", () => {
  it.each([
    ["image/png", png], ["image/jpeg", Buffer.from([255, 216, 255, 224])],
    ["image/webp", Buffer.from("RIFF1234WEBP")]
  ])("accepts matching %s header", (mediaType, bytes) => {
    expect(ReferenceInputSchema.safeParse({ ...image, mediaType, base64: bytes.toString("base64") }).success).toBe(true);
  });
  it.each([null, {}, { ...image, base64: 42 }, { ...image, base64: "data:image/png;base64,abc" },
    { ...image, base64: "AAAA!!!!" }, { ...image, base64: "abcd=" },
    { ...image, mediaType: "image/svg+xml" }, { ...image, mediaType: "image/jpeg" },
    { ...image, additionalViews: [image, image, image] }, { ...image, additionalViews: [{}] }
  ])("rejects malformed or unsupported input %#", input => {
    expect(ReferenceInputSchema.safeParse(input).success).toBe(false);
  });
  it("accepts two valid extra views", () => {
    expect(ReferenceInputSchema.safeParse({ ...image, additionalViews: [image, image] }).success).toBe(true);
  });
  it("rejects combined images beyond the byte budget", () => {
    const bytes = Buffer.alloc(MAX_REFERENCE_BYTES / 2 + 1); png.copy(bytes);
    const view = { ...image, base64: bytes.toString("base64") };
    expect(ReferenceInputSchema.safeParse({ ...view, additionalViews: [view] }).success).toBe(false);
  });
  it("rejects an oversized single image before decoding", () => {
    expect(ReferenceInputSchema.safeParse({ ...image, base64: "A".repeat(MAX_REFERENCE_BYTES * 2) }).success).toBe(false);
  });
});
