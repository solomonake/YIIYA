import type * as Three from "three";

/** An authored reference-guided mesh study, not a scan or official character asset. */
export function buildLuffyModel(
  T: typeof Three,
  material: (color: string) => Three.MeshStandardMaterial,
) {
  const group = new T.Group();
  const skin = "#edbd95",
    red = "#bb302c",
    blue = "#355c9a",
    straw = "#d6ac59";
  function mesh(
    geometry: Three.BufferGeometry,
    color: string,
    position: number[] = [0, 0, 0],
  ) {
    const object = new T.Mesh(geometry, material(color));
    object.position.set(position[0], position[1], position[2]);
    object.castShadow = true;
    object.receiveShadow = true;
    group.add(object);
    return object;
  }
  function oval(color: string, p: number[], s: number[]) {
    const object = mesh(new T.SphereGeometry(1, 32, 20), color, p);
    object.scale.set(s[0], s[1], s[2]);
    return object;
  }
  function stroke(color: string, points: number[][], radius: number) {
    const curve = new T.CatmullRomCurve3(
      points.map((p) => new T.Vector3(...(p as [number, number, number]))),
    );
    return mesh(new T.TubeGeometry(curve, 20, radius, 8, false), color);
  }
  function lathe(color: string, profile: number[][], p: number[], flatten = 1) {
    const object = mesh(
      new T.LatheGeometry(
        profile.map((p) => new T.Vector2(p[0], p[1])),
        40,
      ),
      color,
      p,
    );
    object.scale.z = flatten;
    return object;
  }
  function panel(
    color: string,
    outline: number[][],
    depth: number,
    position: number[],
  ) {
    const shape = new T.Shape();
    shape.moveTo(outline[0][0], outline[0][1]);
    for (const p of outline.slice(1)) shape.lineTo(p[0], p[1]);
    shape.closePath();
    return mesh(
      new T.ExtrudeGeometry(shape, {
        depth,
        bevelEnabled: true,
        bevelSize: 0.012,
        bevelThickness: 0.01,
        bevelSegments: 3,
        steps: 1,
      }),
      color,
      position,
    );
  }
  // Long legs, knee-length shorts, exposed ankles and strapped sandals.
  for (const side of [-1, 1]) {
    const x = side * 0.17;
    oval(skin, [x, 0.56, 0], [0.095, 0.42, 0.095]);
    oval(skin, [x, 0.2, 0.055], [0.08, 0.16, 0.095]);
    oval("#8e653b", [x, 0.11, 0.1], [0.13, 0.035, 0.23]);
    oval(skin, [x, 0.16, 0.1], [0.105, 0.05, 0.19]);
    stroke(
      "#382b23",
      [
        [x - 0.085, 0.185, 0.02],
        [x, 0.218, 0.09],
        [x + 0.085, 0.185, 0.02],
      ],
      0.021,
    );
    stroke(
      "#382b23",
      [
        [x, 0.218, 0.09],
        [x, 0.19, 0.23],
      ],
      0.017,
    );
    for (let toe = 0; toe < 4; toe++)
      oval(skin, [x + (toe - 1.5) * 0.038, 0.172, 0.255], [0.021, 0.027, 0.03]);
    lathe(
      blue,
      [
        [0.11, 0],
        [0.13, 0.12],
        [0.155, 0.38],
        [0.15, 0.55],
      ],
      [x, 0.84, 0],
      0.85,
    );
    lathe(
      "#e7dfc8",
      [
        [0.113, 0],
        [0.129, 0.02],
        [0.13, 0.075],
        [0.117, 0.09],
      ],
      [x, 0.82, 0],
      0.9,
    );
    for (let n = 0; n < 12; n++) {
      const a = (n * Math.PI) / 6;
      oval(
        "#e7dfc8",
        [x + Math.cos(a) * 0.12, 0.84, Math.sin(a) * 0.105],
        [0.027, 0.035, 0.025],
      );
    }
    stroke(
      "#284579",
      [
        [x + side * 0.09, 0.96, 0.075],
        [x + side * 0.1, 1.2, 0.09],
        [x + side * 0.08, 1.36, 0.075],
      ],
      0.008,
    );
  }
  oval(blue, [0, 1.32, 0], [0.29, 0.17, 0.14]);
  // Torso silhouette is a tapered continuous surface, with restrained sculpted anatomy.
  lathe(
    skin,
    [
      [0.19, 0],
      [0.18, 0.13],
      [0.2, 0.34],
      [0.27, 0.57],
      [0.26, 0.68],
      [0.12, 0.73],
    ],
    [0, 1.43, 0],
    0.58,
  );
  for (const side of [-1, 1]) {
    oval(skin, [side * 0.115, 1.98, 0.113], [0.12, 0.11, 0.022]);
    for (let n = 0; n < 3; n++)
      oval(skin, [side * 0.052, 1.62 + n * 0.11, 0.113], [0.047, 0.06, 0.012]);
  }
  oval(skin, [0, 2.23, 0], [0.085, 0.12, 0.085]);
  // Open red jacket: separate lapels, split hems and long flared sleeves.
  for (const side of [-1, 1]) {
    const coat = panel(
      red,
      [
        [0.095, 0],
        [0.28, -0.05],
        [0.31, 0.12],
        [0.29, 0.45],
        [0.32, 0.62],
        [0.22, 0.76],
        [0.11, 0.68],
        [0.12, 0.42],
      ],
      0.065,
      [0, 1.4, 0.055],
    );
    coat.scale.x = side;
    stroke(
      "#e55b45",
      [
        [side * 0.11, 1.47, 0.14],
        [side * 0.14, 1.8, 0.14],
        [side * 0.11, 2.06, 0.14],
      ],
      0.014,
    );
    const sleeve = lathe(
      red,
      [
        [0.1, 0],
        [0.085, 0.15],
        [0.085, 0.37],
        [0.12, 0.56],
      ],
      [side * 0.38, 1.48, 0],
      1,
    );
    sleeve.rotation.z = side * 0.17;
    const cuff = lathe(
      red,
      [
        [0.12, 0],
        [0.105, 0.1],
        [0.08, 0.17],
      ],
      [side * 0.38, 1.39, 0],
    );
    cuff.rotation.z = side * 0.17;
    oval(skin, [side * 0.4, 1.3, 0.005], [0.07, 0.13, 0.07]);
    oval(skin, [side * 0.41, 1.18, 0.015], [0.078, 0.085, 0.06]);
    for (let n = 0; n < 4; n++)
      oval(
        skin,
        [side * 0.41 + (n - 1.5) * 0.027, 1.15, 0.062],
        [0.017, 0.045, 0.02],
      );
    for (let n = 0; n < 3; n++)
      oval(
        "#d9b86f",
        [side * 0.18, 1.56 + n * 0.17, 0.145],
        [0.025, 0.025, 0.012],
      );
  }
  // Yellow wrapped sash and its hanging cloth tails.
  lathe(
    "#e8be39",
    [
      [0.28, 0],
      [0.285, 0.05],
      [0.27, 0.16],
      [0.26, 0.18],
    ],
    [0, 1.35, 0],
    0.62,
  );
  for (let n = 0; n < 4; n++)
    stroke(
      "#c49a28",
      [
        [-0.23, 1.38 + n * 0.036, 0.1],
        [0, 1.4 + n * 0.035, 0.18],
        [0.24, 1.39 + n * 0.035, 0.09],
      ],
      0.007,
    );
  panel(
    "#e8be39",
    [
      [0, 0],
      [0.1, -0.02],
      [0.18, -0.6],
      [0.09, -0.65],
      [0.02, -0.49],
      [-0.04, -0.18],
    ],
    0.025,
    [0.22, 1.4, 0.08],
  );
  panel(
    "#f0cc4f",
    [
      [0, 0],
      [0.08, -0.04],
      [0.08, -0.65],
      [-0.02, -0.61],
      [-0.04, -0.3],
    ],
    0.025,
    [0.28, 1.38, 0.02],
  );
  stroke(
    "#c49a28",
    [
      [0.28, 1.31, 0.13],
      [0.3, 1.05, 0.13],
      [0.34, 0.83, 0.13],
    ],
    0.008,
  );
  // Narrow anime jaw, ears, wide white eyes and small black pupils.
  const skull = new T.SphereGeometry(1, 40, 28);
  const vertices = skull.attributes.position;
  for (let n = 0; n < vertices.count; n++) {
    const y = vertices.getY(n),
      jaw = y < -0.15 ? 1 + (y + 0.15) * 0.28 : 1;
    vertices.setX(n, vertices.getX(n) * jaw);
  }
  skull.computeVertexNormals();
  const head = mesh(skull, skin, [0, 2.58, 0]);
  head.scale.set(0.205, 0.275, 0.174);
  for (const side of [-1, 1]) {
    oval(skin, [side * 0.202, 2.56, 0], [0.036, 0.065, 0.037]);
    oval("#fffaf0", [side * 0.079, 2.6, 0.153], [0.064, 0.067, 0.029]);
    oval("#161719", [side * 0.079, 2.6, 0.18], [0.022, 0.031, 0.009]);
    stroke(
      "#292427",
      [
        [side * 0.038, 2.682, 0.155],
        [side * 0.08, 2.694, 0.16],
        [side * 0.12, 2.681, 0.14],
      ],
      0.009,
    );
  }
  oval(skin, [0, 2.545, 0.18], [0.028, 0.05, 0.036]);
  stroke(
    "#7e493c",
    [
      [-0.105, 2.485, 0.144],
      [-0.06, 2.465, 0.168],
      [0, 2.459, 0.18],
      [0.06, 2.465, 0.168],
      [0.105, 2.485, 0.144],
    ],
    0.006,
  );
  stroke(
    "#7e493c",
    [
      [0.09, 2.51, 0.166],
      [0.15, 2.51, 0.131],
    ],
    0.005,
  );
  for (const x of [0.105, 0.13])
    stroke(
      "#7e493c",
      [
        [x, 2.495, 0.155],
        [x, 2.525, 0.151],
      ],
      0.004,
    );
  // Chest scar, deliberately raised like a sculpted figure rather than a painted decal.
  stroke(
    "#be8275",
    [
      [-0.15, 2.04, 0.13],
      [-0.07, 1.94, 0.155],
      [0.1, 1.78, 0.14],
    ],
    0.014,
  );
  stroke(
    "#be8275",
    [
      [0.15, 2.04, 0.13],
      [0.07, 1.94, 0.155],
      [-0.1, 1.78, 0.14],
    ],
    0.014,
  );
  // Black layered fringe and nape under a broad woven straw hat.
  oval("#202024", [0, 2.7, -0.055], [0.215, 0.2, 0.17]);
  for (let n = 0; n < 11; n++) {
    const x = (n - 5) * 0.034;
    stroke(
      "#202024",
      [
        [x * 0.7, 2.81, 0.08],
        [x, 2.73, 0.15],
        [x * 0.95, 2.65 + (n % 3) * 0.035, 0.166],
      ],
      0.025,
    );
  }
  for (const side of [-1, 1])
    stroke(
      "#202024",
      [
        [side * 0.18, 2.72, -0.02],
        [side * 0.205, 2.6, -0.02],
        [side * 0.19, 2.48, -0.035],
      ],
      0.034,
    );
  lathe(
    straw,
    [
      [0, 0],
      [0.37, 0],
      [0.44, 0.025],
      [0.44, 0.045],
      [0.35, 0.058],
      [0, 0.058],
    ],
    [0, 2.83, 0],
    0.84,
  );
  lathe(
    straw,
    [
      [0.235, 0],
      [0.24, 0.08],
      [0.205, 0.19],
      [0.12, 0.23],
      [0, 0.24],
    ],
    [0, 2.87, -0.02],
    0.9,
  );
  lathe(
    "#b32e2b",
    [
      [0.239, 0],
      [0.241, 0.055],
    ],
    [0, 2.89, -0.02],
    0.9,
  );
  for (let n = 0; n < 11; n++) {
    const ring = mesh(
      new T.TorusGeometry(0.25 + n * 0.017, 0.003, 4, 64),
      n % 2 ? "#ae873e" : "#ebc878",
      [0, 2.889, 0],
    );
    ring.rotation.x = Math.PI / 2;
    ring.scale.y = 0.84;
  }
  // Keep hat seated on the hair and feet above the shared plinth.
  for (const child of group.children) {
    if (child.position.y >= 2.83) child.position.y -= 0.08;
    else if (child.position.y > 2.35) child.position.y -= 0.05;
  }
  group.position.y = 0.11;
  group.scale.setScalar(0.88);
  return group;
}
