/** Bound the complete JSON envelope, including unknown fields, before parsing. */
export const MAX_GENERATION_BODY_BYTES = 4_250_000;
export class GenerationBodyError extends Error {
  constructor(public readonly status: 400 | 413, message: string) { super(message); }
}
export async function readGenerationBody(request: Request): Promise<unknown> {
  const tooLarge = () => new GenerationBodyError(413, "Upload smaller photos: the generation request exceeds 4.25 MB.");
  if (Number(request.headers.get("content-length")) > MAX_GENERATION_BODY_BYTES) {
    await request.body?.cancel();
    throw tooLarge();
  }
  if (!request.body) throw new GenerationBodyError(400, "Invalid JSON body");
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let total = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_GENERATION_BODY_BYTES) throw tooLarge();
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text);
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    if (error instanceof GenerationBodyError) throw error;
    throw new GenerationBodyError(400, "Invalid JSON body");
  } finally {
    reader.releaseLock();
  }
}
