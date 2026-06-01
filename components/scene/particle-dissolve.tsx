"use client";

/**
 * Particle dissolve. Rendered during the GENERATING stage. Density inversely
 * follows generation progress so the cloud thins out as the real mesh arrives.
 *
 * Uses an instanced THREE.Points cloud rather than 5000 meshes — keeps the
 * draw call cost flat regardless of particle count.
 *
 * Sized to the typographic placeholder bounds (~3 world units across).
 */
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

export type ParticleDissolveProps = {
  /** 0..1 — generation progress. Particle count = (1 - progress) × maxCount. */
  progress: number;
  /** Optional label echoed at top — the prompt being generated. */
  text?: string;
  color?: string;
  maxCount?: number;
};

export function ParticleDissolve({
  progress,
  color = "var(--yiiya-accent, #FFFFFF)",
  maxCount = 1500
}: ParticleDissolveProps) {
  const points = useRef<THREE.Points>(null);

  // Generate a stable cloud — positions stay constant; opacity scales with progress.
  const { positions, sizes } = useMemo(() => {
    const positions = new Float32Array(maxCount * 3);
    const sizes = new Float32Array(maxCount);
    for (let i = 0; i < maxCount; i++) {
      // Spherical shell with biased radius — looks like a dissolving cloud, not a sphere.
      const phi = Math.random() * Math.PI * 2;
      const cos = Math.random() * 2 - 1;
      const sin = Math.sqrt(1 - cos * cos);
      const r = 1.0 + Math.random() * 1.1;
      positions[i * 3] = sin * Math.cos(phi) * r;
      positions[i * 3 + 1] = (cos * r) - 0.1;
      positions[i * 3 + 2] = sin * Math.sin(phi) * r;
      sizes[i] = 0.02 + Math.random() * 0.05;
    }
    return { positions, sizes };
  }, [maxCount]);

  useFrame((_, dt) => {
    if (!points.current) return;
    points.current.rotation.y += 0.08 * dt;
    const mat = points.current.material as THREE.PointsMaterial;
    // Visible-count proxy via opacity. progress=0 → fully visible, progress=1 → 0.
    mat.opacity = Math.max(0, 1 - progress);
  });

  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
        <bufferAttribute
          attach="attributes-size"
          args={[sizes, 1]}
        />
      </bufferGeometry>
      <pointsMaterial
        color={color}
        size={0.04}
        sizeAttenuation
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}
