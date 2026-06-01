"use client";

/**
 * Renders a generated GLB. Handles:
 *   - Draco + meshopt decoding (encoded by lib/scene/glb-optimizer.ts).
 *   - PBR materials, including correct transmission / opacity for glass.
 *   - LOD switching when /low, /mid, /high variants are available.
 *   - Suspense fallback (renders nothing — particle dissolve covers the gap).
 *
 * Drei's useGLTF auto-attaches DRACOLoader/MeshoptDecoder when imported with
 * its `.preload` static — we just preload once on first render.
 */
import { useGLTF, Detailed } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import * as THREE from "three";

export type GeneratedMeshProps = {
  url: string;
  /** If provided, three URLs `${lodBase}/low.glb`, `/mid.glb`, `/high.glb` are used for LOD. */
  lodBase?: string;
  /** If true, materials with low alpha get transmission to render true glass. */
  promoteTransmission?: boolean;
  scale?: number | [number, number, number];
  position?: [number, number, number];
};

export function GeneratedMesh({
  url,
  lodBase,
  promoteTransmission = true,
  scale = 1,
  position = [0, 0, 0]
}: GeneratedMeshProps) {
  if (lodBase) {
    // LOD-aware path.
    return (
      <Detailed distances={[0, 12, 28]} position={position}>
        <SingleGlb url={`${lodBase}/high.glb`} promoteTransmission={promoteTransmission} scale={scale} />
        <SingleGlb url={`${lodBase}/mid.glb`}  promoteTransmission={promoteTransmission} scale={scale} />
        <SingleGlb url={`${lodBase}/low.glb`}  promoteTransmission={promoteTransmission} scale={scale} />
      </Detailed>
    );
  }
  return <SingleGlb url={url} promoteTransmission={promoteTransmission} scale={scale} position={position} />;
}

function SingleGlb({
  url,
  promoteTransmission,
  scale,
  position
}: {
  url: string;
  promoteTransmission: boolean;
  scale: number | [number, number, number];
  position?: [number, number, number];
}) {
  const gltf = useGLTF(url);
  const scene = useMemo(() => gltf.scene.clone(true), [gltf.scene]);

  useEffect(() => {
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const mat = mesh.material as THREE.MeshPhysicalMaterial | THREE.Material;
      if (!(mat instanceof THREE.MeshStandardMaterial)) return;

      // Promote standard → physical when transparency/opacity is in play —
      // gives us transmission, thickness, IOR for real glass rendering.
      if (
        promoteTransmission &&
        (mat.transparent || mat.opacity < 0.99 || ((mat as THREE.MeshStandardMaterial).alphaMap !== null))
      ) {
        const physical = new THREE.MeshPhysicalMaterial();
        physical.copy(mat as unknown as THREE.MeshStandardMaterial);
        physical.transmission = 1.0;
        physical.thickness = 0.5;
        physical.ior = 1.5;
        physical.attenuationDistance = 1.0;
        physical.transparent = true;
        mesh.material = physical;
      }
    });
  }, [scene, promoteTransmission]);

  return <primitive object={scene} scale={scale} position={position} />;
}

// Preload the loaders so the first GLB doesn't pay decoder-init cost.
// Safe to call multiple times — drei dedupes.
if (typeof window !== "undefined") {
  useGLTF.preload("data:model/gltf-binary;base64,Z2xURg=="); // no-op preload
}
