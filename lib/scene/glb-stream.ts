/** Validate the GLB envelope while streaming, without buffering the whole asset.
 * This verifies transport completeness, not glTF JSON or mesh correctness.
 */
export async function openGlbStream(response: Response, maxBytes: number): Promise<ReadableStream<Uint8Array>> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 20) throw new Error("Invalid byte limit");
  if (!response.body) throw new Error("Missing artifact body");
  if (Number(response.headers.get("content-length")) > maxBytes) {
    await response.body.cancel();
    throw new Error("Artifact exceeds byte limit");
  }
  const reader = response.body.getReader();
  const prefix = new Uint8Array(12);
  const initial: Uint8Array[] = [];
  let total = 0;
  let expected = 0;
  let released = false;
  const release = () => { if (!released) { released = true; reader.releaseLock(); } };
  const cancel = async (reason?: unknown) => {
    if (released) return;
    try { await reader.cancel(reason); } finally { release(); }
  };
  try {
    while (total < prefix.length) {
      const { value, done } = await reader.read();
      if (done) throw new Error("Truncated GLB header");
      if (total + value.byteLength > maxBytes) throw new Error("Artifact exceeds byte limit");
      prefix.set(value.subarray(0, prefix.length - total), total);
      total += value.byteLength;
      initial.push(value);
    }
    const header = new DataView(prefix.buffer);
    expected = header.getUint32(8, true);
    if (header.getUint32(0, true) !== 0x46546c67 || header.getUint32(4, true) !== 2 || expected < 20) {
      throw new Error("Invalid GLB header");
    }
    if (expected > maxBytes) throw new Error("Artifact exceeds byte limit");
    if (total > expected) throw new Error("GLB length mismatch");
  } catch (error) {
    await cancel(error).catch(() => undefined);
    throw error;
  }
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const first = initial.shift();
        if (first) { controller.enqueue(first); return; }
        const { value, done } = await reader.read();
        if (done) {
          release();
          if (total !== expected) throw new Error("Truncated GLB body");
          controller.close();
          return;
        }
        total += value.byteLength;
        if (total > expected || total > maxBytes) throw new Error("GLB length mismatch");
        controller.enqueue(value);
      } catch (error) {
        await cancel(error).catch(() => undefined);
        controller.error(error);
      }
    },
    cancel
  }, { highWaterMark: 0 });
}
