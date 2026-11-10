"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { buildLuffyModel } from "./landing-luffy-model";
import type * as THREE from "three";
import styles from "./landing-character-cast.module.css";

const CAST = [
  {
    name: "Sprout",
    color: "#9be8ad",
    kind: "Forest friend",
    prompt:
      "a sculpted miniature tree with a tapered bark-covered trunk, branching limbs, exposed roots and individually shaped green leaves",
  },
  {
    name: "Dino",
    color: "#c7a1ff",
    kind: "Reconstructed ceramic sculpture",
    prompt:
      "a detailed ceramic stegosaurus sculpture on an oval plinth, natural anatomical proportions, carved back plates and a matte stone glaze",
  },
  {
    name: "Luffy",
    color: "#ffab87",
    kind: "Reference-guided sculpt study",
    prompt:
      "a detailed Monkey D. Luffy sculpture matching his slim anime proportions, woven straw hat, black hair, open red jacket, chest scar, yellow sash, blue knee-length shorts and sandals",
  },
  {
    name: "Nova",
    color: "#91c9ff",
    kind: "Anime explorer",
    prompt:
      "a detailed blue-haired anime explorer sculpture with a cream jacket, cobalt boots and coral backpack, balanced full-body proportions and sculpted fabric",
  },
];

/** DinoRing reconstruction plus hand-authored studies; provenance shown per slide. */
export function LandingCharacterCast() {
  const host = useRef<HTMLDivElement>(null);
  const turn = useRef(0);
  const selected = useRef(1);
  const [active, setActive] = useState(1);
  const [meshView, setMeshView] = useState(false);
  const meshMode = useRef(false);
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">(
    "loading",
  );

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let disposed = false;
    let cleanup = () => {};
    void import("three")
      .then(async (T) => {
        if (disposed) return;
        const { GLTFLoader } =
          await import("three/examples/jsm/loaders/GLTFLoader.js");
        const reconstructed = await new GLTFLoader().loadAsync(
          "/models/dinoring-reconstructed.glb",
        );
        const importedMaterials = new Set<THREE.Material>();
        const importedTextures = new Set<THREE.Texture>();
        reconstructed.scene.traverse((o) => {
          if (o instanceof T.Mesh) {
            for (const m of Array.isArray(o.material)
              ? o.material
              : [o.material]) {
              importedMaterials.add(m);
              for (const value of Object.values(m))
                if (value instanceof T.Texture) importedTextures.add(value);
            }
          }
        });
        function disposeImported() {
          reconstructed.scene.traverse((o) => {
            if (o instanceof T.Mesh) o.geometry.dispose();
          });
          importedMaterials.forEach((m) => m.dispose());
          importedTextures.forEach((t) => t.dispose());
        }
        if (disposed) {
          disposeImported();
          return;
        }
        let renderer: THREE.WebGLRenderer;
        try {
          renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
        } catch {
          disposeImported();
          setStatus("unavailable");
          return;
        }
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        renderer.outputColorSpace = T.SRGBColorSpace;
        renderer.toneMapping = T.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.25;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = T.PCFSoftShadowMap;
        element.appendChild(renderer.domElement);
        const scene = new T.Scene();
        const camera = new T.PerspectiveCamera(31, 1, 0.1, 60);
        camera.position.set(0, 3.2, 6.8);
        camera.lookAt(0, 1.3, 0);
        scene.add(new T.HemisphereLight(0xe5eeff, 0x544154, 1.4));
        const key = new T.DirectionalLight(0xffeedc, 3.4);
        key.position.set(-3, 7, 6);
        key.castShadow = true;
        key.shadow.mapSize.set(1024, 1024);
        key.shadow.camera.left = -4;
        key.shadow.camera.right = 4;
        key.shadow.camera.top = 5;
        key.shadow.camera.bottom = -3;
        key.shadow.normalBias = 0.025;
        key.shadow.radius = 3;
        scene.add(key);
        const rim = new T.DirectionalLight(0xa4baff, 2.5);
        rim.position.set(5, 4, -4);
        scene.add(rim);
        const figures: THREE.Group[] = [];
        // Deterministic procedural material maps; no downloaded textures or provider calls.
        const textures: THREE.CanvasTexture[] = [];
        function surface(kind: "bark" | "cloth" | "scales") {
          const tile = document.createElement("canvas");
          tile.width = 256;
          tile.height = 256;
          const ctx = tile.getContext("2d")!;
          ctx.fillStyle = "#888";
          ctx.fillRect(0, 0, 256, 256);
          for (let y = 0; y < 256; y += kind === "bark" ? 2 : 8)
            for (let x = 0; x < 256; x += 8) {
              const v =
                90 +
                Math.floor(
                  (((Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1) +
                    1) *
                    45,
                );
              ctx.strokeStyle = `rgb(${v},${v},${v})`;
              ctx.lineWidth = kind === "bark" ? 3 : 1;
              ctx.beginPath();
              if (kind === "scales")
                ctx.ellipse(x + (y % 16 ? 4 : 0), y, 3.5, 3, 0, 0, Math.PI * 2);
              else {
                ctx.moveTo(x, y);
                ctx.lineTo(
                  x + (kind === "bark" ? Math.sin(y * 0.15) * 3 : 7),
                  y + (kind === "bark" ? 14 : 0),
                );
              }
              ctx.stroke();
            }
          const texture = new T.CanvasTexture(tile);
          texture.wrapS = texture.wrapT = T.RepeatWrapping;
          texture.repeat.set(kind === "bark" ? 2 : 3, kind === "bark" ? 1 : 3);
          textures.push(texture);
          return texture;
        }
        const bark = surface("bark"),
          cloth = surface("cloth"),
          scales = surface("scales");
        const materials = new Map<string, THREE.MeshStandardMaterial>();
        const material = (color: string) => {
          if (!materials.has(color))
            materials.set(
              color,
              new T.MeshStandardMaterial({
                color,
                roughness: color === "#252033" ? 0.2 : 0.7,
                bumpMap: ["#b97b4e", "#c6915f"].includes(color)
                  ? bark
                  : ["#9863df", "#ba8afa", "#8752ce"].includes(color)
                    ? scales
                    : ["#ed6250", "#fff0d3", "#417ba6", "#efc66b"].includes(
                          color,
                        )
                      ? cloth
                      : null,
                bumpScale: ["#b97b4e", "#c6915f"].includes(color)
                  ? 0.055
                  : 0.018,
              }),
            );
          return materials.get(color)!;
        };
        function part(
          parent: THREE.Group,
          color: string,
          p: number[],
          s: number[],
          shape = "ball",
        ) {
          const geometry =
            shape === "cone"
              ? new T.ConeGeometry(1, 2, 10)
              : shape === "cylinder"
                ? new T.CylinderGeometry(1, 1, 2, 32)
                : new T.SphereGeometry(1, 24, 16);
          const mesh = new T.Mesh(geometry, material(color));
          mesh.position.set(p[0], p[1], p[2]);
          mesh.scale.set(s[0], s[1], s[2]);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          parent.add(mesh);
          return mesh;
        }
        function eyes(g: THREE.Group, y: number, z: number, spacing = 0.19) {
          for (const x of [-spacing, spacing]) {
            part(g, "#252033", [x, y, z], [0.065, 0.095, 0.045]);
            part(
              g,
              "#ffffff",
              [x - 0.016, y + 0.03, z + 0.035],
              [0.02, 0.025, 0.016],
            );
          }
          const smile = new T.Mesh(
            new T.TorusGeometry(0.105, 0.022, 8, 20, Math.PI),
            material("#603640"),
          );
          smile.rotation.z = Math.PI;
          smile.position.set(0, y - 0.14, z + 0.02);
          g.add(smile);
        }
        CAST.forEach((_, i) => {
          const g = new T.Group();
          g.position.set(0, 0, 0);
          g.visible = i === selected.current;
          g.rotation.y = -0.2;
          figures.push(g);
          scene.add(g);
          if (i !== 1)
            part(
              g,
              ["#244235", "#392b52", "#51312c", "#243d55"][i],
              [0, 0.05, 0],
              [1.04, 0.095, 0.87],
              "cylinder",
            );
          if (i === 0) {
            for (const x of [-0.25, 0.25])
              part(g, "#b97b4e", [x, 0.34, 0.12], [0.22, 0.28, 0.28]);
            const trunkGeometry = new T.CylinderGeometry(
              0.28,
              0.45,
              1.25,
              18,
              8,
            );
            const trunkPositions = trunkGeometry.attributes.position;
            for (let n = 0; n < trunkPositions.count; n++) {
              const y = trunkPositions.getY(n),
                x = trunkPositions.getX(n),
                z = trunkPositions.getZ(n);
              const uneven =
                1 + 0.055 * Math.sin(y * 13 + Math.atan2(z, x) * 5);
              trunkPositions.setXYZ(n, x * uneven, y, z * uneven);
            }
            trunkGeometry.computeVertexNormals();
            const trunk = new T.Mesh(trunkGeometry, material("#c6915f"));
            trunk.position.y = 0.95;
            trunk.castShadow = true;
            trunk.receiveShadow = true;
            g.add(trunk);
            for (const [x, y, z, size] of [
              [-0.43, 1.65, 0, 0.55],
              [0.4, 1.72, 0, 0.57],
              [0, 2.12, -0.05, 0.67],
              [0, 1.8, 0.28, 0.52],
            ])
              part(
                g,
                y > 2 ? "#a9ee83" : "#62cb92",
                [x, y, z],
                [size, size * 0.87, size * 0.8],
              );
            for (const x of [-0.57, 0.57]) {
              const arm = part(g, "#b97b4e", [x, 1.02, 0], [0.15, 0.4, 0.15]);
              arm.rotation.z = x > 0 ? -0.75 : 0.75;
            }
            // Individually shaped leaves break up the spherical canopy silhouette.
            for (let n = 0; n < 92; n++) {
              const a = n * 2.39996,
                v = (n + 0.5) / 92,
                r = Math.sqrt(1 - (2 * v - 1) ** 2);
              const leaf = part(
                g,
                ["#438354", "#65ad62", "#8cca72"][n % 3],
                [
                  Math.cos(a) * r * 0.83,
                  1.96 + (2 * v - 1) * 0.68,
                  Math.sin(a) * r * 0.57,
                ],
                [0.14, 0.065, 0.25],
              );
              leaf.rotation.set(a * 0.3, a, 0.4);
            }
            for (const x of [-0.28, 0, 0.28]) {
              const root = part(
                g,
                "#b97b4e",
                [x, 0.24, 0.32],
                [0.12, 0.12, 0.35],
              );
              root.rotation.y = x;
            }
            for (let n = 0; n < 5; n++) {
              const a = (n * Math.PI * 2) / 5;
              const curve = new T.CatmullRomCurve3([
                new T.Vector3(0, 0.65, 0),
                new T.Vector3(Math.cos(a) * 0.22, 1.1, Math.sin(a) * 0.22),
                new T.Vector3(Math.cos(a) * 0.59, 1.65, Math.sin(a) * 0.42),
              ]);
              const branch = new T.Mesh(
                new T.TubeGeometry(curve, 14, 0.09, 10, false),
                material("#b97b4e"),
              );
              branch.castShadow = true;
              g.add(branch);
            }
          } else if (i === 1) {
            const model = reconstructed.scene;
            const box = new T.Box3().setFromObject(model);
            const size = box.getSize(new T.Vector3());
            const center = box.getCenter(new T.Vector3());
            model.position.sub(center);
            model.position.y += size.y / 2;
            g.scale.setScalar(2.8 / Math.max(size.x, size.y, size.z));
            model.traverse((o) => {
              if (o instanceof T.Mesh) {
                o.castShadow = true;
                o.receiveShadow = true;
              }
            });
            g.add(model);
          } else if (i === 2) {
            g.add(buildLuffyModel(T, material));
          } else {
            const pirate = false;
            const skin = "#efb98f";
            for (const x of [-0.23, 0.23]) {
              part(
                g,
                pirate ? skin : "#3f78cb",
                [x, 0.48, 0],
                [0.15, 0.28, 0.16],
              );
              part(
                g,
                pirate ? "#754936" : "#84baff",
                [x, 0.27, 0.12],
                [0.22, 0.12, 0.3],
              );
            }
            part(
              g,
              pirate ? "#417ba6" : "#283963",
              [0, 0.73, 0],
              [0.41, 0.25, 0.29],
            );
            part(
              g,
              pirate ? "#ed6250" : "#fff0d3",
              [0, 1.13, 0],
              [0.33, 0.46, 0.25],
            );
            if (pirate) part(g, skin, [0, 1.22, 0.27], [0.14, 0.3, 0.04]);
            for (const x of [-0.51, 0.51]) {
              const arm = part(
                g,
                pirate ? skin : "#fff0d3",
                [x, 1.13, 0],
                [0.14, 0.36, 0.15],
              );
              arm.rotation.z = x > 0 ? 0.3 : -0.3;
              part(g, skin, [x, 0.83, 0.04], [0.15, 0.16, 0.15]);
            }
            part(
              g,
              pirate ? "#282333" : "#396ecb",
              [0, 1.91, -0.04],
              [0.52, 0.55, 0.46],
            );
            part(g, skin, [0, 1.88, 0.12], [0.46, 0.46, 0.4]);
            eyes(g, 1.9, 0.49);
            part(g, skin, [0, 1.79, 0.52], [0.06, 0.075, 0.065]);
            for (const x of [-0.46, 0.46]) {
              part(g, skin, [x, 1.84, 0.08], [0.085, 0.13, 0.09]);
              part(g, "#d89577", [x, 1.84, 0.15], [0.04, 0.075, 0.025]);
            }
            for (let n = 0; n < 3; n++)
              part(
                g,
                pirate ? "#ffcc71" : "#8393a3",
                [pirate ? 0.21 : 0, 1.08 + n * 0.14, 0.29],
                [0.028, 0.028, 0.025],
              );
            for (const x of [-0.25, 0.25]) {
              const seam = part(
                g,
                pirate ? "#b84535" : "#d0c2a7",
                [x, 1.12, 0.25],
                [0.017, 0.28, 0.018],
              );
              seam.rotation.z = x * 0.5;
            }
            if (pirate) {
              part(g, "#efc66b", [0, 2.24, 0], [0.76, 0.08, 0.63], "cylinder");
              part(g, "#efc66b", [0, 2.39, -0.02], [0.45, 0.23, 0.4]);
              part(
                g,
                "#d65345",
                [0, 2.29, -0.02],
                [0.455, 0.06, 0.405],
                "cylinder",
              );
              for (let n = 0; n < 10; n++) {
                const weave = new T.Mesh(
                  new T.TorusGeometry(0.23 + n * 0.055, 0.008, 5, 64),
                  material(n % 2 ? "#a98544" : "#d8b66c"),
                );
                weave.rotation.x = Math.PI / 2;
                weave.position.y = 2.323;
                weave.scale.z = 0.84;
                g.add(weave);
              }
              for (let n = 0; n < 7; n++) {
                const hair = part(
                  g,
                  "#282333",
                  [-0.36 + n * 0.12, 2.07, 0.34],
                  [0.09, 0.15, 0.11],
                  "cone",
                );
                hair.rotation.z = 0.2;
              }
            } else {
              for (let n = 0; n < 9; n++) {
                const hair = part(
                  g,
                  n % 2 ? "#79b8f8" : "#4b8de8",
                  [-0.4 + n * 0.1, 2.22 + Math.sin(n * 0.5) * 0.12, 0.17],
                  [0.11, 0.3, 0.24],
                  "cone",
                );
                hair.rotation.z = -0.5;
              }
              part(g, "#ff8c78", [0.32, 1.22, -0.32], [0.25, 0.32, 0.18]);
              part(g, "#76b4f5", [0, 1.28, 0.29], [0.09, 0.09, 0.04]);
            }
            // Slightly smaller head and a visible neck move the silhouette from
            // a bobblehead toward a stylized full character.
            const head = new T.Group();
            head.position.y = 2.04;
            for (const child of [...g.children]) {
              if (child.position.y >= 1.55) {
                child.position.y -= 1.9;
                head.add(child);
              }
            }
            head.scale.setScalar(0.72);
            g.add(head);
            part(g, skin, [0, 1.64, 0.03], [0.14, 0.2, 0.14]);
            for (const x of [-0.51, 0.51])
              for (let n = 0; n < 3; n++)
                part(
                  g,
                  skin,
                  [x + (n - 1) * 0.06, 0.77, 0.12],
                  [0.032, 0.07, 0.04],
                );
          }
        });
        // Taller, less infant-like figure proportions for the anime studies.
        figures.slice(3).forEach((g) => {
          for (const child of g.children) {
            if (child.position.y > 0.7) child.position.y += 0.48;
            else if (child.position.y > 0.35) {
              child.position.y += 0.22;
              child.scale.y *= 1.75;
            }
            if (Math.abs(child.position.x) > 0.46) child.position.x *= 0.82;
          }
          g.scale.setScalar(0.88);
        });
        const wireMaterial = new T.MeshBasicMaterial({
          color: 0xc5e5ff,
          wireframe: true,
          transparent: true,
          opacity: 0.34,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -1,
        });
        const wires: THREE.Mesh[] = [];
        figures.forEach((g) => {
          const originals: THREE.Mesh[] = [];
          g.traverse((o) => {
            if (o instanceof T.Mesh) originals.push(o);
          });
          originals.forEach((m) => {
            const wire = new T.Mesh(m.geometry, wireMaterial);
            wire.visible = false;
            wire.scale.setScalar(1.002);
            m.add(wire);
            wires.push(wire);
          });
        });
        element.dataset.geometryFinite = String(
          figures.every((g) => {
            let finite = true;
            g.traverse((o) => {
              if (o instanceof T.Mesh)
                for (const value of o.geometry.attributes.position.array)
                  if (!Number.isFinite(value)) finite = false;
            });
            return finite;
          }),
        );
        const setMeshMode = () => {
          wires.forEach((w) => {
            w.visible = meshMode.current;
          });
          render();
        };
        element.addEventListener("cast-mesh", setMeshMode);
        const resize = () => {
          const { width, height } = element.getBoundingClientRect();
          renderer.setSize(width, height);
          camera.aspect = width / Math.max(height, 1);
          camera.fov = camera.aspect < 0.85 ? 38 : 31;
          camera.updateProjectionMatrix();
          render();
        };
        function render() {
          figures.forEach((g, i) => {
            g.rotation.y = turn.current - 0.2;
          });
          renderer.render(scene, camera);
          if (!element) return;
          element.dataset.renderedTriangles = String(
            renderer.info.render.triangles,
          );
          element.dataset.renderedLines = String(renderer.info.render.lines);
          element.dataset.meshMode = String(meshMode.current);
        }
        let frame = 0;
        let shown = selected.current;
        const select = () => {
          cancelAnimationFrame(frame);
          const previous = shown,
            next = selected.current;
          shown = next;
          turn.current = 0;
          const start = performance.now();
          const reduced = window.matchMedia(
            "(prefers-reduced-motion: reduce)",
          ).matches;
          function step(now: number) {
            const progress = reduced ? 1 : Math.min(1, (now - start) / 420);
            const eased = 1 - Math.pow(1 - progress, 4);
            figures.forEach((g, i) => {
              g.visible = i === next || (i === previous && progress < 1);
              g.position.x = i === next ? (1 - eased) * 4.8 : -eased * 4.8;
            });
            render();
            if (progress < 1) frame = requestAnimationFrame(step);
          }
          frame = requestAnimationFrame(step);
        };
        let pointerX: number | null = null;
        const down = (e: PointerEvent) => {
          pointerX = e.clientX;
          element.setPointerCapture(e.pointerId);
        };
        const move = (e: PointerEvent) => {
          if (pointerX === null) return;
          turn.current += (e.clientX - pointerX) * 0.012;
          pointerX = e.clientX;
          render();
        };
        const up = () => {
          pointerX = null;
        };
        const lost = (e: Event) => {
          e.preventDefault();
          setStatus("unavailable");
        };
        const rotate = () => render();
        element.addEventListener("pointerdown", down);
        element.addEventListener("pointermove", move);
        element.addEventListener("pointerup", up);
        element.addEventListener("pointercancel", up);
        element.addEventListener("lostpointercapture", up);
        element.addEventListener("cast-turn", rotate);
        element.addEventListener("cast-select", select);
        renderer.domElement.addEventListener("webglcontextlost", lost);
        const observer = new ResizeObserver(resize);
        observer.observe(element);
        resize();
        setStatus("ready");
        cleanup = () => {
          observer.disconnect();
          cancelAnimationFrame(frame);
          element.removeEventListener("cast-select", select);
          element.removeEventListener("pointerdown", down);
          element.removeEventListener("pointermove", move);
          element.removeEventListener("pointerup", up);
          element.removeEventListener("pointercancel", up);
          element.removeEventListener("lostpointercapture", up);
          element.removeEventListener("cast-turn", rotate);
          renderer.domElement.removeEventListener("webglcontextlost", lost);
          const geometries = new Set<THREE.BufferGeometry>();
          scene.traverse((o) => {
            if (o instanceof T.Mesh) geometries.add(o.geometry);
          });
          geometries.forEach((geometry) => geometry.dispose());
          materials.forEach((m) => m.dispose());
          textures.forEach((t) => t.dispose());
          element.removeEventListener("cast-mesh", setMeshMode);
          wireMaterial.dispose();
          importedMaterials.forEach((m) => m.dispose());
          importedTextures.forEach((t) => t.dispose());
          renderer.dispose();
          renderer.domElement.remove();
        };
      })
      .catch(() => {
        if (!disposed) setStatus("unavailable");
      });
    return () => {
      disposed = true;
      cleanup();
    };
  }, []);

  function choose(index: number) {
    const next = (index + CAST.length) % CAST.length;
    if (next === selected.current) return;
    selected.current = next;
    setActive(next);
    host.current?.dispatchEvent(new Event("cast-select"));
  }
  function toggleMesh() {
    meshMode.current = !meshMode.current;
    setMeshView(meshMode.current);
    host.current?.dispatchEvent(new Event("cast-mesh"));
  }
  function rotate() {
    turn.current += Math.PI / 4;
    host.current?.dispatchEvent(new Event("cast-turn"));
  }
  const current = CAST[active];
  return (
    <section
      className={styles.cast}
      aria-label="Character slideshow"
      aria-roledescription="carousel"
    >
      <div className={styles.stage}>
        <div
          ref={host}
          className={styles.canvas}
          role="img"
          aria-label={`Interactive 3D character: ${current.name}`}
        />
        {status !== "ready" && (
          <p className={styles.fallback} role="status">
            {status === "loading"
              ? "Setting the stage…"
              : "3D preview unavailable. You can still browse character ideas below."}
          </p>
        )}
        <div className={styles.controls}>
          <button
            type="button"
            onClick={toggleMesh}
            aria-pressed={meshView}
            disabled={status !== "ready"}
          >
            Mesh view
          </button>
          <button
            type="button"
            onClick={rotate}
            disabled={status !== "ready"}
            aria-label="Rotate character display"
          >
            Turn ↻
          </button>
        </div>
      </div>
      <div className={styles.featured}>
        <div aria-live="polite" aria-atomic="true">
          <h2 style={{ color: current.color }}>{current.name}</h2>
          <p>
            {current.kind} · {active + 1} / {CAST.length}
          </p>
        </div>
        <div className={styles.navigation}>
          <button
            type="button"
            onClick={() => choose(active - 1)}
            aria-label="Previous character"
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => choose(active + 1)}
            aria-label="Next character"
          >
            →
          </button>
        </div>
      </div>
      <div className={styles.roster} aria-label="Choose a character">
        {CAST.map((c, i) => (
          <button
            type="button"
            key={c.name}
            onClick={() => choose(i)}
            aria-pressed={active === i}
            className={styles.character}
            style={{ "--cast-color": c.color } as React.CSSProperties}
          >
            <span className={styles.dot} aria-hidden="true" />
            <span>{c.name}</span>
          </button>
        ))}
      </div>
      <Link
        className={styles.create}
        href={`/app?prompt=${encodeURIComponent(current.prompt)}`}
      >
        Create with this idea <span aria-hidden="true">↗</span>
      </Link>
      <p className={styles.caption}>
        {active === 1
          ? "DinoRing photo reconstruction · reference fidelity not yet scored"
          : "Handcrafted study · not a reference-matched reconstruction"}
      </p>
    </section>
  );
}
