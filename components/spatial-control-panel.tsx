"use client";

import { useYiiyaStore } from "@/lib/store";

export function SpatialControlPanel() {
  const canvasMode = useYiiyaStore((state) => state.canvasMode);
  const addSceneObject = useYiiyaStore((state) => state.addSceneObject);
  const morphBlob = useYiiyaStore((state) => state.morphBlob);
  const updateSceneObject = useYiiyaStore((state) => state.updateSceneObject);
  const removeSceneObject = useYiiyaStore((state) => state.removeSceneObject);
  const sceneObjects = useYiiyaStore((state) => state.sceneObjects);

  if (canvasMode === "WEB") {
    return null;
  }

  const applyMaterial = (material: "gold" | "glass" | "chrome") => {
    if (sceneObjects.length > 0) {
      updateSceneObject("latest", {
        material,
        color: material === "gold" ? "#FFD700" : material === "chrome" ? "#C0C0C0" : "#EDEDED",
        materialOverrides:
          material === "gold"
            ? { metalness: 1, roughness: 0.2 }
            : material === "glass"
              ? { transmission: 1, roughness: 0, transparent: true, opacity: 0.82 }
              : { metalness: 1, roughness: 0.05 }
      });
      return;
    }

    morphBlob({
      material,
      distort: material === "glass" ? 0.62 : 0.38,
      speed: material === "chrome" ? 1.4 : 2.1,
      morphProgress: 0.8
    });
  };

  return (
    <div className="pointer-events-auto absolute left-5 top-16 z-30 grid gap-1 border border-terminalBorder bg-[#050505]/88 p-1 text-[10px] font-bold uppercase tracking-[0.1em] text-white/48 backdrop-blur">
      <button
        type="button"
        title="Add a rotating gold sphere"
        onClick={() =>
          addSceneObject({
            shape: "sphere",
            material: "gold",
            color: "#FFD700",
            animation: "rotate",
            position: [1.6, 0.45, -1.1],
            scale: [0.72, 0.72, 0.72],
            intensity: 0.7
          })
        }
        className="h-7 px-2 text-left transition hover:bg-white/[0.04] hover:text-amber"
      >
        + sphere
      </button>
      <button
        type="button"
        title="Morph the living blob"
        onClick={() =>
          morphBlob({
            targetShape: "organic",
            distort: 0.72,
            speed: 2.6,
            aspectRatio: 1.2,
            morphProgress: 1
          })
        }
        className="h-7 px-2 text-left transition hover:bg-white/[0.04] hover:text-amber"
      >
        morph
      </button>
      <div className="grid grid-cols-3 gap-1">
        {(["gold", "glass", "chrome"] as const).map((material) => (
          <button
            key={material}
            type="button"
            title={`Make latest object ${material}`}
            onClick={() => applyMaterial(material)}
            className="h-7 border border-terminalBorder px-1 transition hover:border-amber/70 hover:text-amber"
          >
            {material.slice(0, 2)}
          </button>
        ))}
      </div>
      <button
        type="button"
        title="Remove all 3D objects and return to the living blob"
        onClick={() => removeSceneObject("*")}
        className="h-7 px-2 text-left text-red-200/70 transition hover:bg-red-500/10 hover:text-red-200"
      >
        clear 3d
      </button>
    </div>
  );
}
