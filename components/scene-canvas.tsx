"use client";

import {
  Environment,
  Float,
  Grid,
  OrbitControls,
  useGLTF,
  useAnimations
} from "@react-three/drei";
import { Physics, RigidBody } from "@react-three/rapier";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef } from "react";
import type { Group, Mesh, Object3D } from "three";
import { Box3, Color, MeshStandardMaterial, Raycaster, Vector2, Vector3 } from "three";
import type { MaterialOverride } from "@/lib/scene/local-edit";
import { styleMaterialPack } from "@/lib/scene/styles";
import { useYiiyaStore, type SceneObject, type SpatialAnchor } from "@/lib/store";
import { registerExportObject, registerExportRoot } from "@/lib/spatial-export";
import { Stage as StagePlaceholder } from "@/components/scene/stage";
import { GlbErrorBoundary } from "@/components/scene/glb-error-boundary";
import type { StageState } from "@/lib/scene/stage-state";
import { capturePoster, hasCaptured } from "@/lib/assets/capture-poster";
import { registerCanvasForRecording, registerSpinControl } from "@/lib/scene/turntable-recorder";

function materialNode(
  object: SceneObject
) {
  const pack = styleMaterialPack(object.style, object.color, object.material);

  if (pack.materialType === "toon") {
    return (
      <meshToonMaterial
        color={String(pack.materialProps.color ?? object.color)}
      />
    );
  }

  if (pack.materialType === "standard") {
    return (
      <meshStandardMaterial
        color={String(pack.materialProps.color ?? object.color)}
        roughness={typeof pack.materialProps.roughness === "number" ? pack.materialProps.roughness : 0.7}
        metalness={typeof pack.materialProps.metalness === "number" ? pack.materialProps.metalness : 0}
        wireframe={pack.wireframe}
        flatShading={pack.flatShading}
      />
    );
  }

  return (
    <meshPhysicalMaterial
      color={String(pack.materialProps.color ?? object.color)}
      roughness={typeof pack.materialProps.roughness === "number" ? pack.materialProps.roughness : 0.48}
      metalness={typeof pack.materialProps.metalness === "number" ? pack.materialProps.metalness : 0.18}
      clearcoat={typeof pack.materialProps.clearcoat === "number" ? pack.materialProps.clearcoat : 0}
      transmission={typeof pack.materialProps.transmission === "number" ? pack.materialProps.transmission : 0}
      opacity={typeof pack.materialProps.opacity === "number" ? pack.materialProps.opacity : 1}
      transparent={Boolean(pack.materialProps.transparent)}
      emissive={pack.materialProps.emissive as string | undefined}
      emissiveIntensity={
        typeof pack.materialProps.emissiveIntensity === "number"
          ? pack.materialProps.emissiveIntensity
          : undefined
      }
      flatShading={pack.flatShading}
      wireframe={pack.wireframe}
    />
  );
}

function LibraryMesh({ object }: { object: SceneObject }) {
  const key = object.modelUrl.replace("library://", "");

  if (key === "cup") {
    return (
      <group>
        <mesh position={[0, 0.02, 0]}>
          <cylinderGeometry args={[0.42, 0.34, 0.72, 32]} />
          {materialNode(object)}
        </mesh>
        <mesh position={[0.38, 0.08, 0]} rotation={[0, 0, Math.PI / 2]}>
          <torusGeometry args={[0.18, 0.04, 14, 24, Math.PI]} />
          {materialNode(object)}
        </mesh>
      </group>
    );
  }

  if (key === "bottle") {
    return (
      <group>
        <mesh position={[0, -0.02, 0]}>
          <cylinderGeometry args={[0.3, 0.38, 1.1, 32]} />
          {materialNode(object)}
        </mesh>
        <mesh position={[0, 0.64, 0]}>
          <cylinderGeometry args={[0.14, 0.18, 0.34, 24]} />
          {materialNode(object)}
        </mesh>
      </group>
    );
  }

  if (key === "laptop") {
    return (
      <group>
        <mesh position={[0, -0.18, 0]} rotation={[-0.08, 0, 0]}>
          <boxGeometry args={[1.8, 0.08, 1.18]} />
          {materialNode(object)}
        </mesh>
        <mesh position={[0, 0.26, -0.44]} rotation={[-0.9, 0, 0]}>
          <boxGeometry args={[1.72, 1.02, 0.06]} />
          {materialNode({ ...object, color: "#171B24", style: "realistic" })}
        </mesh>
      </group>
    );
  }

  if (key === "phone") {
    return (
      <group>
        <mesh>
          <boxGeometry args={[0.66, 1.34, 0.08]} />
          {materialNode(object)}
        </mesh>
        <mesh position={[0, 0, 0.05]}>
          <boxGeometry args={[0.56, 1.12, 0.02]} />
          {materialNode({ ...object, color: "#0B0E13", style: "realistic" })}
        </mesh>
      </group>
    );
  }

  if (key === "watch") {
    return (
      <group rotation={[0.4, 0.2, 0.18]}>
        <mesh>
          <torusGeometry args={[0.48, 0.09, 22, 46]} />
          {materialNode(object)}
        </mesh>
        <mesh position={[0, 0, 0.1]}>
          <cylinderGeometry args={[0.32, 0.32, 0.12, 32]} />
          {materialNode({ ...object, color: "#0D1117", style: "realistic" })}
        </mesh>
      </group>
    );
  }

  if (key === "chair") {
    return (
      <group>
        <mesh position={[0, 0.18, 0]}>
          <boxGeometry args={[0.96, 0.12, 0.98]} />
          {materialNode(object)}
        </mesh>
        <mesh position={[0, 0.88, -0.36]}>
          <boxGeometry args={[0.96, 1.18, 0.12]} />
          {materialNode(object)}
        </mesh>
        {[
          [-0.36, -0.46, -0.32],
          [0.36, -0.46, -0.32],
          [-0.36, -0.46, 0.32],
          [0.36, -0.46, 0.32]
        ].map((position, index) => (
          <mesh key={index} position={position as [number, number, number]}>
            <cylinderGeometry args={[0.05, 0.05, 0.98, 12]} />
            {materialNode(object)}
          </mesh>
        ))}
      </group>
    );
  }

  if (key === "table") {
    return (
      <group>
        <mesh position={[0, 0.22, 0]}>
          <boxGeometry args={[1.7, 0.1, 1.06]} />
          {materialNode(object)}
        </mesh>
        {[
          [-0.68, -0.42, -0.38],
          [0.68, -0.42, -0.38],
          [-0.68, -0.42, 0.38],
          [0.68, -0.42, 0.38]
        ].map((position, index) => (
          <mesh key={index} position={position as [number, number, number]}>
            <cylinderGeometry args={[0.05, 0.05, 0.92, 12]} />
            {materialNode(object)}
          </mesh>
        ))}
      </group>
    );
  }

  if (key === "lamp") {
    return (
      <group>
        <mesh position={[0, -0.32, 0]}>
          <cylinderGeometry args={[0.42, 0.48, 0.08, 28]} />
          {materialNode(object)}
        </mesh>
        <mesh position={[0, 0.18, 0]}>
          <cylinderGeometry args={[0.05, 0.05, 0.92, 18]} />
          {materialNode(object)}
        </mesh>
        <mesh position={[0, 0.72, 0]}>
          <coneGeometry args={[0.42, 0.58, 28]} />
          {materialNode(object)}
        </mesh>
      </group>
    );
  }

  if (key === "car") {
    return (
      <group>
        <mesh position={[0, 0.05, 0]}>
          <boxGeometry args={[1.8, 0.42, 0.86]} />
          {materialNode(object)}
        </mesh>
        <mesh position={[0.04, 0.34, 0]} scale={[1.15, 0.65, 0.82]}>
          <sphereGeometry args={[0.48, 32, 32]} />
          {materialNode(object)}
        </mesh>
        {[-0.58, 0.58].flatMap((x) => [
          <mesh key={`${x}-front`} position={[x, -0.22, 0.42]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.16, 0.16, 0.14, 20]} />
            {materialNode({ ...object, color: "#111111", style: "realistic" })}
          </mesh>,
          <mesh key={`${x}-rear`} position={[x, -0.22, -0.42]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.16, 0.16, 0.14, 20]} />
            {materialNode({ ...object, color: "#111111", style: "realistic" })}
          </mesh>
        ])}
      </group>
    );
  }

  if (key === "shoe") {
    return (
      <group rotation={[0, -0.3, 0]}>
        <mesh position={[0, 0.08, 0]}>
          <capsuleGeometry args={[0.36, 1.12, 10, 18]} />
          {materialNode(object)}
        </mesh>
        <mesh position={[0.28, 0.06, 0.02]} scale={[0.58, 0.44, 0.92]}>
          <sphereGeometry args={[0.34, 20, 20]} />
          {materialNode(object)}
        </mesh>
      </group>
    );
  }

  if (key === "bust") {
    return (
      <group>
        <mesh position={[0, 0.58, 0]}>
          <sphereGeometry args={[0.42, 28, 28]} />
          {materialNode(object)}
        </mesh>
        <mesh position={[0, -0.04, 0]} scale={[0.78, 1.1, 0.62]}>
          <capsuleGeometry args={[0.34, 0.76, 8, 18]} />
          {materialNode(object)}
        </mesh>
      </group>
    );
  }

  if (key === "pedestal") {
    return (
      <mesh>
        <cylinderGeometry args={[0.74, 0.94, 0.72, 28]} />
        {materialNode(object)}
      </mesh>
    );
  }

  if (key === "camera") {
    return (
      <group>
        <mesh>
          <boxGeometry args={[1.2, 0.8, 0.68]} />
          {materialNode(object)}
        </mesh>
        <mesh position={[0.22, 0, 0.38]}>
          <cylinderGeometry args={[0.22, 0.28, 0.34, 28]} />
          {materialNode({ ...object, color: "#111111", style: "realistic" })}
        </mesh>
      </group>
    );
  }

  if (key === "bag") {
    return (
      <group>
        <mesh position={[0, 0.08, 0]}>
          <boxGeometry args={[1.02, 1.08, 0.42]} />
          {materialNode(object)}
        </mesh>
        <mesh position={[0, 0.74, 0]} rotation={[0, 0, Math.PI]}>
          <torusGeometry args={[0.26, 0.04, 16, 24, Math.PI]} />
          {materialNode(object)}
        </mesh>
      </group>
    );
  }

  if (key === "plant") {
    return (
      <group>
        <mesh position={[0, -0.36, 0]}>
          <cylinderGeometry args={[0.42, 0.48, 0.42, 22]} />
          {materialNode({ ...object, color: "#423126", style: "realistic" })}
        </mesh>
        {[-0.22, 0, 0.22].map((x, index) => (
          <mesh
            key={index}
            position={[x, 0.4 + index * 0.12, 0]}
            rotation={[0.2 * index, 0, 0.2 * (index - 1)]}
          >
            <sphereGeometry args={[0.34 + index * 0.05, 18, 18]} />
            {materialNode({ ...object, color: "#5F8A49", style: "claymation" })}
          </mesh>
        ))}
      </group>
    );
  }

  return (
    <mesh>
      <icosahedronGeometry args={[0.74, 0]} />
      {materialNode(object)}
    </mesh>
  );
}

function MaterializingGroup({
  object,
  children
}: {
  object: SceneObject;
  children: React.ReactNode;
}) {
  const shellRef = useRef<Group>(null);

  useFrame(() => {
    if (!shellRef.current) {
      return;
    }

    const elapsed = Math.min(1, (Date.now() - object.materializedAt) / 1100);
    const eased = 1 - Math.pow(1 - elapsed, 3);
    const scale = 0.82 + eased * 0.18;
    shellRef.current.scale.set(scale, scale, scale);
  });

  return (
    <group ref={shellRef}>
      {Date.now() - object.materializedAt < 900 ? (
        <pointLight
          intensity={1.8}
          color="#EF9F27"
          distance={3.4}
          decay={2}
        />
      ) : null}
      {children}
    </group>
  );
}

function GeneratedMesh({ object }: { object: SceneObject }) {
  const gltf = useGLTF(object.modelUrl);
  const clone = useMemo(() => gltf.scene.clone(), [gltf.scene]);
  const { actions } = useAnimations(gltf.animations, clone);

  useEffect(() => {
    if (gltf.animations.length > 0 && object.animation !== "static") {
      const actionName = gltf.animations[0].name;
      actions[actionName]?.play();
    }

    clone.traverse((child) => {
      if ("userData" in child) {
        (child as Object3D).userData = {
          ...(child as Object3D).userData,
          yiiyaObjectId: object.id
        };
      }
    });
  }, [clone, object.id, gltf.animations, actions, object.animation]);

  return <primitive object={clone} />;
}

function GeneratingPlaceholder({ object }: { object: SceneObject }) {
  return (
    <group>
      <mesh>
        <icosahedronGeometry args={[0.74, 0]} />
        <meshStandardMaterial
          color={object.color}
          wireframe
          transparent
          opacity={0.45}
        />
      </mesh>
      <pointLight intensity={1.2} color="#EF9F27" distance={2.6} />
    </group>
  );
}

function RenderedObject({
  object,
  anchor,
  dockedPosition,
  dockedScale
}: {
  object: SceneObject;
  anchor?: SpatialAnchor;
  dockedPosition?: [number, number, number];
  dockedScale?: [number, number, number];
}) {
  const groupRef = useRef<Group>(null);
  const updateSceneObject = useYiiyaStore((state) => state.updateSceneObject);
  const draggingRef = useRef(false);
  const basePosition = anchor?.worldPosition ?? dockedPosition ?? object.position;
  const baseScale = dockedScale ?? object.scale;

  useEffect(() => {
    registerExportObject(object.id, groupRef.current);

    return () => registerExportObject(object.id, null);
  }, [object.id]);

  useFrame((state) => {
    if (!groupRef.current) {
      return;
    }

    groupRef.current.rotation.set(
      object.rotation[0],
      object.rotation[1],
      object.rotation[2]
    );

    if (object.animation === "rotate" || object.animation === "spin") {
      groupRef.current.rotation.y += 0.01 * object.intensity;
    }

    if (!draggingRef.current) {
      if (object.animation === "float" || object.animation === "drift") {
        groupRef.current.position.y =
          basePosition[1] + Math.sin(state.clock.elapsedTime * 1.3) * 0.06;
      } else if (object.animation === "pulse") {
        const pulse = 1 + Math.sin(state.clock.elapsedTime * 2.1) * 0.06;
        groupRef.current.scale.set(
          baseScale[0] * pulse,
          baseScale[1] * pulse,
          baseScale[2] * pulse
        );
      }
    }
  });

  const handlePointerDown = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    draggingRef.current = true;
  };

  const handlePointerMove = (event: ThreeEvent<PointerEvent>) => {
    if (!draggingRef.current || !groupRef.current) {
      return;
    }

    event.stopPropagation();
    groupRef.current.position.set(event.point.x, event.point.y, event.point.z);
  };

  const handlePointerUp = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    
    if (draggingRef.current && groupRef.current) {
      updateSceneObject(object.id, {
        position: [
          groupRef.current.position.x,
          groupRef.current.position.y,
          groupRef.current.position.z
        ]
      });
    }

    draggingRef.current = false;
  };

  return (
    <group
      ref={groupRef}
      position={basePosition}
      scale={baseScale}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerOut={handlePointerUp}
      userData={{ yiiyaObjectId: object.id }}
    >
      {object.physicsBody ? (
        <RigidBody type={object.physicsBody} colliders="hull" mass={object.mass ?? 1}>
          <MaterializingGroup object={object}>
            {object.generationStatus === "generating" ? (
              <GeneratingPlaceholder object={object} />
            ) : object.modelUrl.startsWith("library://") ? (
              <LibraryMesh object={object} />
            ) : (
              <GeneratedMesh object={object} />
            )}
          </MaterializingGroup>
        </RigidBody>
      ) : (
        <MaterializingGroup object={object}>
          {object.generationStatus === "generating" ? (
            <GeneratingPlaceholder object={object} />
          ) : object.modelUrl.startsWith("library://") ? (
            <LibraryMesh object={object} />
          ) : (
            <GeneratedMesh object={object} />
          )}
        </MaterializingGroup>
      )}
    </group>
  );
}

function QuietStarterMarker() {
  return (
    <group position={[0, 0.3, 0]}>
      <mesh>
        <torusGeometry args={[0.62, 0.02, 18, 80]} />
        <meshBasicMaterial color="#EF9F27" transparent opacity={0.35} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.92, 0.96, 64]} />
        <meshBasicMaterial color="#1C1C1C" transparent opacity={0.6} />
      </mesh>
    </group>
  );
}

function CursorRaycaster() {
  const { camera, scene, size } = useThree();
  const setCursorTarget = useYiiyaStore((state) => state.setCursorTarget);
  const raycasterRef = useRef(new Raycaster());
  const pointerRef = useRef(new Vector2(2, 2));
  const lastHitIdRef = useRef<string | null>(null);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      pointerRef.current.x = (event.clientX / size.width) * 2 - 1;
      pointerRef.current.y = -(event.clientY / size.height) * 2 + 1;
    };

    window.addEventListener("mousemove", handler, { passive: true });

    return () => window.removeEventListener("mousemove", handler);
  }, [size.height, size.width]);

  useFrame(() => {
    raycasterRef.current.setFromCamera(pointerRef.current, camera);
    const hit = raycasterRef.current
      .intersectObjects(scene.children, true)
      .find((entry) => entry.object.userData?.yiiyaObjectId);

    const hitId = hit?.object.userData?.yiiyaObjectId ?? null;
    if (hitId !== lastHitIdRef.current) {
      lastHitIdRef.current = hitId;
      setCursorTarget(hitId ? {
        screenX: 0,
        screenY: 0,
        domElementId: null,
        domTextContent: null,
        sceneObjectId: hitId,
        scenePoint: hit ? [hit.point.x, hit.point.y, hit.point.z] as [number, number, number] : null,
        targetKind: "scene-object",
        description: `Scene object: ${hitId}`
      } : null);
    }
  });

  return null;
}

function ActiveGlbViewer({
  url,
  posterAssetId,
  materialOverride
}: {
  url: string;
  posterAssetId?: string;
  materialOverride?: MaterialOverride;
}) {
  const gltf = useGLTF(url);
  const clone = useMemo(() => gltf.scene.clone(), [gltf.scene]);
  const { actions } = useAnimations(gltf.animations, clone);
  const groupRef = useRef<Group>(null);
  const { gl } = useThree();

  // Many provider GLBs (Hunyuan shape-only, Stable Fast 3D in vertex-color
  // mode) come back with no materials defined. Three.js renders those as
  // black under the studio HDR. Walk the scene and ensure every mesh has a
  // MeshStandardMaterial that uses vertex colors when present.
  useEffect(() => {
    clone.traverse((child) => {
      const mesh = child as Mesh;
      if (!mesh.isMesh) return;
      const hasVertexColors = Boolean((mesh.geometry?.attributes as Record<string, unknown> | undefined)?.color);
      const needsReplacement =
        !mesh.material ||
        (Array.isArray(mesh.material) ? mesh.material.length === 0 : false);
      if (needsReplacement) {
        mesh.material = new MeshStandardMaterial({
          color: hasVertexColors ? 0xffffff : 0xb0b3ba,
          vertexColors: hasVertexColors,
          roughness: 0.55,
          metalness: 0.05
        });
      } else if (hasVertexColors) {
        const single = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
        if (single && "vertexColors" in single) {
          (single as MeshStandardMaterial).vertexColors = true;
          single.needsUpdate = true;
        }
      }
    });
  }, [clone]);

  // Local material edits (lib/scene/local-edit.ts): apply color/finish/glow to
  // every mesh material in-place. Free, instant, and re-applied whenever the
  // override changes — no regeneration. Runs after the vertex-color pass above.
  useEffect(() => {
    if (!materialOverride) return;
    clone.traverse((child) => {
      const mesh = child as Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        const sm = m as MeshStandardMaterial;
        if (!sm) continue;
        if (materialOverride.color) {
          // A chosen color must win over any baked-in vertex colors.
          sm.color = new Color(materialOverride.color);
          if ("vertexColors" in sm) sm.vertexColors = false;
        }
        if (typeof materialOverride.metalness === "number") sm.metalness = materialOverride.metalness;
        if (typeof materialOverride.roughness === "number") sm.roughness = materialOverride.roughness;
        if (materialOverride.emissive) sm.emissive = new Color(materialOverride.emissive);
        if (typeof materialOverride.emissiveIntensity === "number") sm.emissiveIntensity = materialOverride.emissiveIntensity;
        if (typeof materialOverride.opacity === "number") {
          sm.opacity = materialOverride.opacity;
          sm.transparent = materialOverride.opacity < 0.99;
        }
        sm.needsUpdate = true;
      }
    });
  }, [clone, materialOverride]);

  useEffect(() => {
    if (gltf.animations.length > 0) {
      const name = gltf.animations[0].name;
      actions[name]?.play();
    }
  }, [gltf.animations, actions]);

  // Auto-frame: scale and center the loaded mesh so it fills the viewport
  // regardless of the units the provider chose (meters, mm, normalized, etc.).
  const { autoScale, autoOffset } = useMemo(() => {
    const box = new Box3().setFromObject(clone);
    const size = box.getSize(new Vector3());
    const center = box.getCenter(new Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const targetSize = 2.4;
    const scale = targetSize / maxDim;
    return {
      autoScale: scale,
      autoOffset: [-center.x * scale, -box.min.y * scale, -center.z * scale] as [number, number, number]
    };
  }, [clone]);

  // Materializing: scale-up from 0 with a gentle ease on first reveal.
  const mountedAtRef = useRef(Date.now());
  const posterCapturedRef = useRef(false);

  // Turntable recording: a registered spin control drives exactly one clean
  // 360° revolution over a fixed duration, independent of Float's own subtle
  // idle rotation (which keeps running underneath — a small added wobble,
  // not worth the complexity of suppressing for a 4s clip).
  const spinRef = useRef<{ startedAt: number; durationMs: number } | null>(null);
  useEffect(() => {
    registerSpinControl({
      start: (durationMs) => {
        spinRef.current = { startedAt: Date.now(), durationMs };
      }
    });
    return () => registerSpinControl(null);
  }, []);

  useFrame((state) => {
    if (!groupRef.current) return;
    const elapsed = Math.min(1, (Date.now() - mountedAtRef.current) / 900);
    const eased = 1 - Math.pow(1 - elapsed, 3);
    const userScale = materialOverride?.scale ?? 1;
    const s = autoScale * userScale * (0.4 + 0.6 * eased);
    groupRef.current.scale.set(s, s, s);

    if (spinRef.current) {
      const spinElapsed = Date.now() - spinRef.current.startedAt;
      const progress = Math.min(1, spinElapsed / spinRef.current.durationMs);
      groupRef.current.rotation.y = progress * Math.PI * 2;
      if (progress >= 1) spinRef.current = null;
    }

    // One-shot poster capture: wait for the materialize animation to finish
    // and one extra frame to render at full scale, then grab a thumbnail.
    if (
      !posterCapturedRef.current &&
      elapsed >= 1 &&
      posterAssetId &&
      !hasCaptured(posterAssetId)
    ) {
      posterCapturedRef.current = true;
      state.gl.render(state.scene, state.camera);
      void capturePoster(posterAssetId, gl.domElement.toDataURL("image/png"));
    }
  });

  return (
    <Float speed={1.2} rotationIntensity={0.4} floatIntensity={0.4}>
      <group ref={groupRef} position={autoOffset}>
        <primitive object={clone} />
      </group>
    </Float>
  );
}

function GlbLoadFailureFallback() {
  return (
    <group>
      <mesh>
        <icosahedronGeometry args={[0.74, 1]} />
        <meshStandardMaterial color="#EF9F27" wireframe transparent opacity={0.4} />
      </mesh>
      <pointLight intensity={1.0} color="#EF9F27" distance={2.6} />
    </group>
  );
}

function StarterScene({
  objects,
  anchors,
  stage,
  activeGlbUrl,
  activeAssetDbId,
  activeMaterialOverride
}: {
  objects: SceneObject[];
  anchors: SpatialAnchor[];
  stage: StageState;
  activeGlbUrl?: string | null;
  activeAssetDbId?: string;
  activeMaterialOverride?: MaterialOverride;
}) {
  const anchorMap = useMemo(
    () => new Map(anchors.map((anchor) => [anchor.objectId, anchor])),
    [anchors]
  );
  const subduedHybrid = false;
  const hybridDock = (index: number) => {
    const placements: Array<[number, number, number]> = [
      [2.95, 0.1, -2.25],
      [2.3, -0.92, -2.7],
      [2.8, 0.98, -2.95]
    ];

    return placements[index % placements.length];
  };
  const dockScale = (scale: [number, number, number]): [number, number, number] => [
    scale[0] * 0.66,
    scale[1] * 0.66,
    scale[2] * 0.66
  ];

  // Empty-canvas affordance: render the lifecycle-aware Stage when a prompt
  // is active; fall back to the QuietStarterMarker only when nothing has
  // been asked yet (stage.kind === "EMPTY"). Once any real SceneObject
  // exists we render the actual objects below and skip both.
  const showPlaceholder = objects.length === 0 && !activeGlbUrl;

  return (
    <>
      {showPlaceholder ? (
        stage.kind === "EMPTY" ? <QuietStarterMarker /> : <StagePlaceholder state={stage} />
      ) : null}

      {activeGlbUrl ? (
        <GlbErrorBoundary fallback={<GlbLoadFailureFallback />}>
          <Suspense fallback={<GlbLoadFailureFallback />}>
            <ActiveGlbViewer
              url={activeGlbUrl}
              posterAssetId={activeAssetDbId}
              materialOverride={activeMaterialOverride}
            />
          </Suspense>
        </GlbErrorBoundary>
      ) : null}

      {objects.map((object, index) => {
        const anchor = anchorMap.get(object.id);
        const dockedPosition = !anchor && subduedHybrid ? hybridDock(index) : undefined;
        const dockedScale = !anchor && subduedHybrid ? dockScale(object.scale) : undefined;

        return (
          <RenderedObject
            key={object.id}
            object={object}
            anchor={anchor}
            dockedPosition={dockedPosition}
            dockedScale={dockedScale}
          />
        );
      })}

      <Grid
        position={[0, -0.02, 0]}
        args={[14, 14]}
        cellSize={0.62}
        cellThickness={0.5}
        cellColor="#1A1A1A"
        sectionSize={2.48}
        sectionThickness={0.9}
        sectionColor="#2A2A2A"
        fadeDistance={18}
        fadeStrength={1.6}
      />
      <Environment preset="studio" />
      <CursorRaycaster />
      <CanvasRecordingRegistrar />
    </>
  );
}

// Registers the WebGL canvas element for turntable recording. Split out
// because useThree() is only callable inside <Canvas>, while SceneCanvas
// itself renders <Canvas> from the outside.
function CanvasRecordingRegistrar() {
  const { gl } = useThree();
  useEffect(() => {
    registerCanvasForRecording(gl.domElement);
    return () => registerCanvasForRecording(null);
  }, [gl]);
  return null;
}

export function SceneCanvas({
  activeGlbUrl,
  activeAssetDbId,
  activeMaterialOverride
}: {
  activeGlbUrl?: string | null;
  activeAssetDbId?: string;
  activeMaterialOverride?: MaterialOverride;
}) {
  const sceneObjects = useYiiyaStore((state) => state.sceneObjects);
  const spatialAnchors = useYiiyaStore((state) => state.spatialAnchors);
  const stage = useYiiyaStore((state) => state.stage);
  const rootGroupRef = useRef<Group>(null);

  useEffect(() => {
    registerExportRoot(rootGroupRef.current);

    return () => registerExportRoot(null);
  }, []);

  return (
    <div
      className="absolute inset-0 z-0 transition-opacity"
      style={{
        opacity: 1,
        pointerEvents: "auto"
      }}
    >
      <Canvas
        data-yiiya-scene-canvas="true"
        gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
        camera={{ position: [0, 0, 5], fov: 56 }}
        style={{ position: "absolute", inset: 0 }}
        dpr={[1, 2]}
        className="h-full w-full"
      >
        <color attach="background" args={["#050505"]} />
        <fog attach="fog" args={["#050505", 6, 16]} />
        <ambientLight intensity={0.88} />
        <directionalLight position={[3, 4, 5]} intensity={2.1} color="#fff6df" />
        <pointLight position={[-3, 2.4, 3]} intensity={1.2} color="#EF9F27" />
        <Physics gravity={[0, -9.81, 0]}>
          <group ref={rootGroupRef}>
            <StarterScene
              objects={sceneObjects}
              anchors={spatialAnchors}
              stage={stage}
              activeGlbUrl={activeGlbUrl}
              activeAssetDbId={activeAssetDbId}
              activeMaterialOverride={activeMaterialOverride}
            />
          </group>
        </Physics>
        <OrbitControls
          enabled
          enablePan={false}
          maxDistance={12}
          // Allow orbiting well below the horizon so the underside of a model is
          // inspectable; stop just short of a full flip to avoid disorienting
          // upside-down views.
          maxPolarAngle={Math.PI * 0.92}
        />
      </Canvas>
    </div>
  );
}
