import type { Client } from "@gradio/client";

export class ProviderDeadlineError extends Error {}

/** Bounds waiting; abort requests cancellation, but cannot prove remote compute stopped. */
export async function withProviderDeadline<T>(run: (signal: AbortSignal) => Promise<T>, ms: number, label: string): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new ProviderDeadlineError(`${label} timed out after ${Math.round(ms / 1000)}s; remote completion is unknown`);
      reject(error);
      controller.abort(error);
    }, ms);
  });
  try { return await Promise.race([Promise.resolve().then(() => run(controller.signal)), timeout]); }
  finally { clearTimeout(timer); }
}

/** One stage, with an explicit cancellation handle and no new submissions after abort. */
export async function predictGradio(client: Pick<Client, "submit">, signal: AbortSignal | undefined, endpoint: string, data: Record<string, unknown> | unknown[]): Promise<{ data: unknown }> {
  signal?.throwIfAborted();
  const job = client.submit(endpoint, data, null, null, true);
  let onAbort: () => void = () => {};
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => {
      reject(signal?.reason ?? new Error("Provider cancelled"));
      // A stalled or failed cancel request must not hold the visitor request open.
      void Promise.resolve().then(() => job.cancel()).catch(() => undefined);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
  const iterator = job[Symbol.asyncIterator]();
  const consume = async () => {
    let result: { data: unknown } | undefined;
    let complete = false;
    while (true) {
      const next = await iterator.next();
      if (next.done) break;
      const message = next.value;
      signal?.throwIfAborted();
      if (message.type === "data") result = { data: message.data };
      if (message.type === "status") {
        if (message.stage === "error") throw new Error(typeof message.message === "string" ? message.message : "Gradio generation failed");
        if (message.stage === "complete") complete = true;
      }
      if (result && complete) return result;
    }
    throw new Error("Gradio stream ended without a complete result");
  };
  try { return await Promise.race([consume(), aborted]); }
  finally {
    signal?.removeEventListener("abort", onAbort);
    // Gradio return() closes its stream then awaits next(); some terminal
    // error paths never settle that promise. Cleanup must not delay outcome.
    void Promise.resolve().then(() => iterator.return?.()).catch(() => undefined);
  }
}
