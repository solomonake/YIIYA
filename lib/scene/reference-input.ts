import { z } from "zod";

/** Application limits, not a claim about a provider's current limits. */
export const MAX_REFERENCE_BYTES = 3 * 1024 * 1024;
const MAX_ENCODED_LENGTH = Math.ceil(MAX_REFERENCE_BYTES / 3) * 4;

const image = z.object({
  base64: z.string().min(1).max(MAX_ENCODED_LENGTH, "Use smaller photos: 3 MiB combined maximum."),
  mediaType: z.enum(["image/png", "image/jpeg", "image/webp"], {
    errorMap: () => ({ message: "Use a PNG, JPEG or WebP photo." })
  })
});

export const ReferenceInputSchema = image.extend({
  name: z.string().min(1).max(255),
  additionalViews: z.array(image).max(2, "Use at most two extra views.").optional()
}).superRefine((value, ctx) => {
  let total = 0;
  const views = [value, ...(value.additionalViews ?? [])];
  for (let index = 0; index < views.length; index++) {
    const view = views[index];
    const path = index === 0 ? ["base64"] : ["additionalViews", index - 1, "base64"];
    // Avoid decoding an oversized value even when an earlier schema check failed.
    if (view.base64.length > MAX_ENCODED_LENGTH) continue;
    if (view.base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(view.base64)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path, message: "Photo data is invalid. Re-upload the original image." });
      continue;
    }
    const bytes = Buffer.from(view.base64, "base64");
    total += bytes.length;
    const signatureMatches = view.mediaType === "image/png"
      ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : view.mediaType === "image/jpeg"
        ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        : bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
    if (bytes.toString("base64") !== view.base64 || !signatureMatches) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path, message: "Photo data does not match its image type. Re-upload a PNG, JPEG or WebP." });
    }
  }
  if (total > MAX_REFERENCE_BYTES) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Use smaller photos: 3 MiB combined maximum." });
  }
});
