"use client";

import { useEffect, useRef, useState } from "react";
import { useYiiyaStore, type LabControl } from "@/lib/store";
import { exportSpatialTarget } from "@/lib/spatial-export";

type HandRuntime = {
  stop: () => void;
};

function controlValueLabel(control: LabControl) {
  if (control.max <= 2) {
    return control.value.toFixed(2);
  }

  return Math.round(control.value).toLocaleString();
}

export function SpatialControlPanel() {
  const canvasMode = useYiiyaStore((state) => state.canvasMode);
  const addSceneObject = useYiiyaStore((state) => state.addSceneObject);
  const morphBlob = useYiiyaStore((state) => state.morphBlob);
  const updateSceneObject = useYiiyaStore((state) => state.updateSceneObject);
  const removeSceneObject = useYiiyaStore((state) => state.removeSceneObject);
  const spawnControl = useYiiyaStore((state) => state.spawnControl);
  const setControlValue = useYiiyaStore((state) => state.setControlValue);
  const labControls = useYiiyaStore((state) => state.labControls);
  const sceneObjects = useYiiyaStore((state) => state.sceneObjects);
  const addLog = useYiiyaStore((state) => state.addLog);
  const exportTarget = useYiiyaStore((state) => state.exportTarget);
  const setExportTarget = useYiiyaStore((state) => state.setExportTarget);
  const [handEnabled, setHandEnabled] = useState(false);
  const [handStatus, setHandStatus] = useState<"idle" | "loading" | "active" | "error">("idle");
  const videoRef = useRef<HTMLVideoElement>(null);
  const handRuntimeRef = useRef<HandRuntime | null>(null);

  useEffect(() => {
    if (!handEnabled) {
      handRuntimeRef.current?.stop();
      handRuntimeRef.current = null;
      setHandStatus("idle");
      return;
    }

    let cancelled = false;

    async function startHandTracking() {
      try {
        setHandStatus("loading");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: 640, height: 480 },
          audio: false
        });
        const video = videoRef.current;

        if (!video) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        video.srcObject = stream;
        await video.play();

        const vision = await import("@mediapipe/tasks-vision");
        const fileset = await vision.FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm"
        );
        const landmarker = await vision.HandLandmarker.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numHands: 1
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          landmarker.close();
          return;
        }

        addLog("[HAND]: Tracking enabled.");
        setHandStatus("active");
        let frameId = 0;
        let lastVideoTime = -1;
        let grabbed = false;

        const tick = () => {
          if (!video || video.readyState < 2) {
            frameId = window.requestAnimationFrame(tick);
            return;
          }

          if (video.currentTime !== lastVideoTime) {
            lastVideoTime = video.currentTime;
            const result = landmarker.detectForVideo(video, performance.now());
            const hand = result.landmarks?.[0];
            const index = hand?.[8];
            const thumb = hand?.[4];

            if (index) {
              const x = (0.5 - index.x) * 4.4;
              const y = (0.5 - index.y) * 3.1;
              const pinch =
                thumb &&
                Math.hypot(index.x - thumb.x, index.y - thumb.y, index.z - thumb.z) < 0.052;

              if (canvasMode === "3D") {
                if (sceneObjects.length > 0) {
                  useYiiyaStore.setState((state) => {
                    const latest = state.sceneObjects.at(-1);

                    if (!latest) {
                      return state;
                    }

                    return {
                      sceneObjects: state.sceneObjects.map((object) =>
                        object.id === latest.id
                          ? { ...object, position: [x, y, -0.15] }
                          : object
                      )
                    };
                  });

                  if (pinch && !grabbed) {
                    addLog("[HAND]: Moving latest 3D object.");
                  }
                } else {
                  useYiiyaStore.setState((state) => ({
                    blobState: {
                      ...state.blobState,
                      controlledByHand: true,
                      formation: pinch ? "helix" : "sphere",
                      twist: x * 0.35,
                      chaos: Math.max(0.12, Math.abs(y) * 0.16),
                      morphProgress: 1
                    }
                  }));

                  if (pinch && !grabbed) {
                    addLog("[HAND]: Molding blob.");
                  }
                }
              } else {
                const element = document.elementFromPoint(
                  index.x * window.innerWidth,
                  index.y * window.innerHeight
                )?.closest<HTMLElement>("[data-yiiya-id]");

                if (pinch && element?.dataset.yiiyaId && !grabbed) {
                  useYiiyaStore.getState().setSelectedElementId(element.dataset.yiiyaId);
                  useYiiyaStore.getState().setSelectedElements([element.dataset.yiiyaId]);
                  addLog(`[HAND]: Selected ${element.dataset.yiiyaId}.`);
                }
              }

              grabbed = Boolean(pinch);
            }
          }

          frameId = window.requestAnimationFrame(tick);
        };

        tick();
        handRuntimeRef.current = {
          stop: () => {
            window.cancelAnimationFrame(frameId);
            landmarker.close();
            stream.getTracks().forEach((track) => track.stop());
          }
        };
      } catch (error) {
        setHandStatus("error");
        setHandEnabled(false);
        addLog(
          `[HAND]: ${
            error instanceof Error ? error.message : "Tracking unavailable."
          }`
        );
      }
    }

    void startHandTracking();

    return () => {
      cancelled = true;
      handRuntimeRef.current?.stop();
      handRuntimeRef.current = null;
    };
  }, [addLog, canvasMode, handEnabled, morphBlob, sceneObjects.length, updateSceneObject]);

  if (canvasMode === "WEB" && labControls.length === 0) {
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
      glow: material === "glass" ? 0.9 : 0.46,
      distort: material === "glass" ? 0.62 : 0.38,
      speed: material === "chrome" ? 1.4 : 2.1,
      morphProgress: 0.8
    });
  };

  const moldFormation = (
    formation: "sphere" | "helix" | "torus" | "bottle" | "capsule" | "cube" | "wave"
  ) => {
    morphBlob({
      formation,
      targetShape:
        formation === "bottle"
          ? "bottle"
          : formation === "cube"
            ? "cube"
            : formation === "helix" || formation === "torus" || formation === "wave"
              ? "organic"
              : "sphere",
      aspectRatio: formation === "bottle" ? 1.75 : formation === "capsule" ? 1.35 : 1,
      twist: formation === "helix" ? 1.35 : 0,
      chaos: formation === "wave" ? 0.74 : 0.28,
      distort: formation === "cube" ? 0.18 : 0.46,
      speed: formation === "helix" ? 2.4 : 1.7,
      morphProgress: 1
    });
  };

  return (
    <div className="pointer-events-auto absolute left-5 top-16 z-30 w-[244px] border border-terminalBorder bg-[#050505]/90 p-2 font-mono text-white/62 backdrop-blur-xl">
      <video ref={videoRef} className="hidden" playsInline muted />
      <div className="flex items-center justify-between border-b border-terminalBorder pb-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber">
            Mold Lab
          </p>
          <p className="mt-1 text-[10px] text-white/36">voice, hand, sliders</p>
        </div>
        <button
          type="button"
          title="Enable hand tracking to select or move objects"
          onClick={() => setHandEnabled((enabled) => !enabled)}
          className="h-8 border px-2 text-[10px] font-bold uppercase tracking-[0.12em] transition hover:border-amber/70 hover:text-amber"
          style={{
            borderColor: handEnabled ? "#EF9F27" : "#1A1A1A",
            color: handEnabled ? "#EF9F27" : "rgba(255,255,255,0.55)"
          }}
        >
          Hand
        </button>
      </div>

      {handStatus === "loading" ? (
        <p className="mt-2 text-[10px] text-white/42">camera initializing...</p>
      ) : null}

      <div className="mt-2 grid grid-cols-3 gap-1">
        {(["sphere", "helix", "torus", "bottle", "capsule", "wave"] as const).map((formation) => (
          <button
            key={formation}
            type="button"
            title={`Mold blob into ${formation}`}
            onClick={() => moldFormation(formation)}
            className="h-8 border border-terminalBorder px-1 text-[10px] font-bold uppercase tracking-[0.08em] transition hover:border-amber/70 hover:text-amber"
          >
            {formation === "torus" ? "Donut" : formation}
          </button>
        ))}
      </div>

      <div className="mt-2 grid grid-cols-3 gap-1">
        {(["gold", "glass", "chrome"] as const).map((material) => (
          <button
            key={material}
            type="button"
            title={`Make latest object or blob ${material}`}
            onClick={() => applyMaterial(material)}
            className="h-8 border border-terminalBorder px-1 text-[10px] font-bold uppercase tracking-[0.08em] transition hover:border-amber/70 hover:text-amber"
          >
            {material}
          </button>
        ))}
      </div>

      <div className="mt-2 grid grid-cols-2 gap-1">
        <button
          type="button"
          title="Add a rotating gold sphere"
          onClick={() =>
            addSceneObject({
              shape: "sphere",
              material: "gold",
              color: "#FFD700",
              animation: "rotate",
              position: [1.85, 0.35, -1.4],
              scale: [0.62, 0.62, 0.62],
              intensity: 0.7
            })
          }
          className="h-8 border border-terminalBorder px-2 text-[10px] font-bold uppercase tracking-[0.08em] transition hover:border-amber/70 hover:text-amber"
        >
          Add sphere
        </button>
        <button
          type="button"
          title="Remove all 3D objects and return to clay"
          onClick={() => {
            removeSceneObject("*");
            moldFormation("sphere");
          }}
          className="h-8 border border-red-500/35 px-2 text-[10px] font-bold uppercase tracking-[0.08em] text-red-200/70 transition hover:border-red-400"
        >
          Clear
        </button>
      </div>

      <button
        type="button"
        title="Spawn an organic control slider"
        onClick={() =>
          spawnControl({
            id: "lab-chaos",
            label: "Organic chaos",
            min: 0,
            max: 1.6,
            step: 0.01,
            value: 0.72,
            target: "blob",
            property: "chaos"
          })
        }
        className="mt-2 h-8 w-full border border-terminalBorder px-2 text-[10px] font-bold uppercase tracking-[0.08em] transition hover:border-amber/70 hover:text-amber"
      >
        Add slider
      </button>

      <div className="mt-2 grid grid-cols-2 gap-1">
        {(["scene", "latest"] as const).map((target) => (
          <button
            key={target}
            type="button"
            onClick={() => setExportTarget(target)}
            className="h-8 border px-2 text-[10px] font-bold uppercase tracking-[0.08em] transition"
            style={{
              borderColor: exportTarget === target ? "#EF9F27" : "#1A1A1A",
              color: exportTarget === target ? "#EF9F27" : "rgba(255,255,255,0.55)"
            }}
          >
            {target}
          </button>
        ))}
      </div>

      <button
        type="button"
        title="Export spatial output"
        onClick={() => {
          try {
            exportSpatialTarget(exportTarget, sceneObjects.at(-1)?.id);
            addLog(
              `[EXPORT]: ${exportTarget === "latest" ? "Latest object" : "Scene"} exported.`
            );
          } catch (error) {
            addLog(
              `[EXPORT]: ${
                error instanceof Error ? error.message : "Export unavailable."
              }`
            );
          }
        }}
        className="mt-2 h-8 w-full border border-terminalBorder px-2 text-[10px] font-bold uppercase tracking-[0.08em] transition hover:border-amber/70 hover:text-amber"
      >
        Export {exportTarget === "latest" ? "Latest" : "Scene"}
      </button>

      {labControls.length > 0 ? (
        <div className="mt-3 grid gap-2 border-t border-terminalBorder pt-3">
          {labControls.map((control) => (
            <label key={control.id} className="grid gap-1">
              <span className="flex items-center justify-between text-[10px] uppercase tracking-[0.12em] text-white/45">
                {control.label}
                <span className="text-amber">{controlValueLabel(control)}</span>
              </span>
              <input
                type="range"
                min={control.min}
                max={control.max}
                step={control.step}
                value={control.value}
                onChange={(event) =>
                  setControlValue(control.id, Number(event.target.value))
                }
                className="accent-amber"
              />
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}
