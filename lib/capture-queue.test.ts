import { beforeEach, describe, expect, it } from "vitest";

import { useYiiyaStore, type ReferenceImage } from "@/lib/store";

function img(name: string): ReferenceImage {
  return { base64: `${name}-bytes`, mediaType: "image/png", name };
}

describe("capture queue", () => {
  beforeEach(() => {
    useYiiyaStore.getState().setCaptureQueue([]);
    useYiiyaStore.getState().setReferenceImage(null);
  });

  it("consumes FIFO, promoting each item to the active reference image", () => {
    const store = useYiiyaStore.getState();
    store.setCaptureQueue([img("a.png"), img("b.png"), img("c.png")]);

    const first = useYiiyaStore.getState().consumeCaptureQueue();
    expect(first?.name).toBe("a.png");
    expect(useYiiyaStore.getState().referenceImage?.name).toBe("a.png");
    expect(useYiiyaStore.getState().captureQueue.map((i) => i.name)).toEqual(["b.png", "c.png"]);

    const second = useYiiyaStore.getState().consumeCaptureQueue();
    expect(second?.name).toBe("b.png");
    expect(useYiiyaStore.getState().captureQueue).toHaveLength(1);
  });

  it("returns null on an empty queue without touching the reference image", () => {
    useYiiyaStore.getState().setReferenceImage(img("keep.png"));

    expect(useYiiyaStore.getState().consumeCaptureQueue()).toBeNull();
    // A failed pop must not clobber whatever the user was working with.
    expect(useYiiyaStore.getState().referenceImage?.name).toBe("keep.png");
  });

  it("setCaptureQueue replaces the queue wholesale", () => {
    const store = useYiiyaStore.getState();
    store.setCaptureQueue([img("a.png")]);
    store.setCaptureQueue([img("x.png"), img("y.png")]);

    expect(useYiiyaStore.getState().captureQueue.map((i) => i.name)).toEqual(["x.png", "y.png"]);
  });
});
