import { expect, it } from "vitest";
import { Raycaster, Vector3 } from "three";
import { buildMug } from "../../features/photo-studio/mug-shape.mjs";

it("keeps a thin mug's sidewall connected below its flared rim", () => {
  const front = {
    centerX: 90, top: 40, base: 170, outerRadius: 64, baseRadius: 38,
    handleRadius: 6, handle: [[145, 58], [185, 60], [200, 90], [180, 120], [134, 125]],
  };
  const camera = { cx: 108, cy: 105, scale: 110 };
  const mesh = buildMug({
    front, side: { centerX: camera.cx, outerRadius: 64 },
    overhead: { outerDiameter: 130, innerDiameter: 122 }, assumedDepthFraction: 0.92,
  }, camera, 0xffffff);
  try {
    // Cast from the cavity towards the wall opposite the handle.
    for (const fractionBelowRim of [0.1, 0.2, 0.5, 0.75]) {
      const imageY = front.top + fractionBelowRim * (front.base - front.top);
      const origin = new Vector3((front.centerX - camera.cx) / camera.scale, (camera.cy - imageY) / camera.scale, 0);
      const ray = new Raycaster(origin, new Vector3(-1, 0, 0));
      const [wall] = ray.intersectObject(mesh);
      expect(wall?.distance).toBeGreaterThan(0.25);
      expect(wall?.distance).toBeLessThan(front.outerRadius / camera.scale);
    }
  } finally {
    mesh.geometry.dispose();
    mesh.material.dispose();
  }
});
