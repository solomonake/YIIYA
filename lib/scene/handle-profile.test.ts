import { describe, expect, it } from "vitest";
import { traceHandle } from "../../features/photo-studio/handle-profile.mjs";

const width = 120, height = 120;
function fixture(mirrored: boolean, open: boolean) {
  const mask = new Uint8Array(width * height);
  const reflect = (x: number) => mirrored ? width - 1 - x : x;
  for (let y = 10; y < 110; y++) {
    for (let x = 12; x < 108; x++) {
      const radial = Math.hypot((x - 74) / 29, (y - 55) / 33);
      const body = x < 70;
      const handle = radial <= 1 && radial >= 0.65 && !(open && y > 52 && y < 59 && x > 84);
      mask[reflect(x) + y * width] = Number(body || handle);
    }
  }
  const guide = [[65, 29], [84, 26], [99, 55], [84, 81], [65, 81]];
  const front = { centerX: reflect(40), outerRadius: 30, baseRadius: 29,
    top: 11, base: 109, handle: guide.map(([x,y]) => [reflect(x), y]), handleRadius: 6 };
  return { mask, front };
}

describe("closed handle photo fit", () => {
  it.each([false, true])("returns a continuous spine anchored to both sockets (mirror %s)", mirrored => {
    const { mask, front } = fixture(mirrored, false);
    const trace = traceHandle(mask, width, height, front);
    expect(trace).toBeTruthy();
    expect(trace!.points[0]).toEqual(front.handle[0]);
    expect(trace!.points.at(-1)).toEqual(front.handle.at(-1));
    expect(trace!.radii.every((r: number) => r > 0)).toBe(true);
  });
  it("retains the existing fit if the supposed hole leaks to the background", () => {
    const { mask, front } = fixture(false, true);
    expect(traceHandle(mask, width, height, front)).toBeNull();
  });
});
