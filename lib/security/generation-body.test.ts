import { expect, it } from "vitest";
import { MAX_GENERATION_BODY_BYTES, readGenerationBody } from "./generation-body";

it("parses streamed JSON with multibyte UTF-8 split across chunks", async () => {
  const bytes = new TextEncoder().encode('{"transcript":"mug ☕"}');
  const stream = new ReadableStream({ start(controller) {
    for (let index = 0; index < bytes.length; index++) controller.enqueue(new Uint8Array([bytes[index]]));
    controller.close();
  } });
  expect(await readGenerationBody(new Request("https://test", { method: "POST", body: stream, duplex: "half" } as RequestInit)))
    .toEqual({ transcript: "mug ☕" });
});
it.each(["absent", "false-low"])("rejects an oversized stream with %s content length", async kind => {
  let cancelled = false;
  const stream = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(MAX_GENERATION_BODY_BYTES + 1)); },
    cancel() { cancelled = true; } });
  const headers = kind === "false-low" ? { "Content-Length": "1" } : undefined;
  const request = new Request("https://test", { method: "POST", body: stream, headers, duplex: "half" } as RequestInit);
  await expect(readGenerationBody(request)).rejects.toMatchObject({ status: 413 });
  expect(cancelled).toBe(true);
});
it("rejects declared oversize before consuming the body", async () => {
  const request = new Request("https://test", { method: "POST", body: "{}", headers: { "Content-Length": String(MAX_GENERATION_BODY_BYTES + 1) } });
  await expect(readGenerationBody(request)).rejects.toMatchObject({ status: 413 });
});
it.each(["{", "", new Uint8Array([255])])("rejects invalid JSON/UTF-8 %#", async body => {
  await expect(readGenerationBody(new Request("https://test", { method: "POST", body }))).rejects.toMatchObject({ status: 400 });
});
