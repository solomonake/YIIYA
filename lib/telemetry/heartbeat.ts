/**
 * Heartbeat utilities for long-running pipeline stages.
 *
 * Pattern: stage emits a heartbeat every N ms. The client-side watchdog
 * (lib/agent/watchdog.ts) treats absence of heartbeats as a stall.
 *
 * Server side: emits Server-Sent Events into a TransformStream.
 * Use createHeartbeatStream() in any route handler that performs work
 * longer than ~1s of wall-clock time.
 */
export type StreamEvent =
  | { kind: "heartbeat"; stage: string; t: number }
  | { kind: "progress"; stage: string; pct: number; eta_ms?: number; note?: string }
  | { kind: "stage_started"; stage: string; t: number }
  | { kind: "stage_completed"; stage: string; ms: number; meta?: Record<string, unknown> }
  | { kind: "stage_failed"; stage: string; ms: number; reason: string }
  | { kind: "result"; data: unknown }
  | { kind: "error"; code: string; message: string };

export type StreamWriter = {
  emit(event: StreamEvent): void;
  close(): void;
  readonly stream: ReadableStream<Uint8Array>;
};

const ENCODER = new TextEncoder();

export function createHeartbeatStream(intervalMs = 1000): StreamWriter {
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  let closed = false;
  let lastStage = "init";

  const send = (event: StreamEvent) => {
    if (closed) return;
    if (event.kind === "stage_started" || event.kind === "stage_completed") {
      lastStage = event.stage;
    }
    const payload = `data: ${JSON.stringify(event)}\n\n`;
    writer.write(ENCODER.encode(payload)).catch(() => undefined);
  };

  const ticker = setInterval(() => {
    send({ kind: "heartbeat", stage: lastStage, t: Date.now() });
  }, intervalMs);

  return {
    emit: send,
    close() {
      if (closed) return;
      closed = true;
      clearInterval(ticker);
      writer.close().catch(() => undefined);
    },
    get stream() {
      return readable;
    }
  };
}

/**
 * Wrap an awaitable stage so it emits start/complete/failed events automatically.
 */
export async function runStage<T>(
  writer: StreamWriter,
  stage: string,
  fn: () => Promise<T>
): Promise<T> {
  const start = Date.now();
  writer.emit({ kind: "stage_started", stage, t: start });
  try {
    const result = await fn();
    writer.emit({ kind: "stage_completed", stage, ms: Date.now() - start });
    return result;
  } catch (err) {
    writer.emit({
      kind: "stage_failed",
      stage,
      ms: Date.now() - start,
      reason: err instanceof Error ? err.message : "unknown"
    });
    throw err;
  }
}

/**
 * Wrap a promise with a timeout. If the timer fires before the promise
 * settles, the returned promise rejects with `code = "timeout"`.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label = "operation"): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => {
      const e: Error & { code?: string } = new Error(`${label} timed out after ${ms}ms`);
      e.code = "timeout";
      reject(e);
    }, ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}
