"use client";

/**
 * Typographic 3D placeholder. Renders the user's prompt as a slowly orbiting
 * extruded word — the visible "INTENT" state for the canvas, replacing the
 * old persistent blob.
 *
 * The font is loaded as a JSON facetype via three's FontLoader. We ship
 * one font (DM Serif Display) bundled at /fonts/dm-serif-display.json — see
 * scripts/build-typographic-font.mjs if you want to swap the bundled face.
 *
 * Refs:
 *   https://threejs.org/docs/#examples/en/geometries/TextGeometry
 *   https://github.com/pmndrs/drei#text3d
 */
import { Center, Text3D } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { Component, Suspense, useRef, type ReactNode } from "react";
import type { Group } from "three";
import { classifyPromptSubject } from "@/lib/scene/prompt-intent";

/**
 * If the bundled typeface JSON is missing or malformed at runtime, the underlying
 * three.js FontLoader throws and unmounts the parent <Canvas>. We wrap Text3D
 * in this boundary so a missing font degrades to "render nothing" instead of
 * killing the whole canvas.
 */
class FontErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    if (typeof console !== "undefined") {
      // eslint-disable-next-line no-console
      console.warn("[TypographicPlaceholder] font load failed, rendering nothing:", err);
    }
  }
  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

export type TypographicPlaceholderProps = {
  text: string;
  /** Hex color string from the planted stake — `--yiiya-fg` by default. */
  color?: string;
  /** Hex color string for subtle emission glow. */
  emissive?: string;
  /** Orbit speed in radians/sec. */
  spinRate?: number;
};

/**
 * IMPORTANT: drei's Text3D consumes a typeface JSON loaded once and cached.
 * The default we point at lives in /public/fonts/. Generate it with:
 *   npx facetype.js DM_Serif_Display-Regular.ttf > public/fonts/dm-serif-display.json
 */
const FONT_URL = "/fonts/dm-serif-display.json";

export function TypographicPlaceholder({
  text,
  color = "var(--yiiya-fg, #F2F2F2)",
  emissive = "var(--yiiya-accent, #FFFFFF)",
  spinRate = 0.18
}: TypographicPlaceholderProps) {
  const group = useRef<Group>(null);
  const promptIntent = classifyPromptSubject(text);

  useFrame((_, dt) => {
    if (!group.current) return;
    group.current.rotation.y += spinRate * dt;
  });

  // Crop overlong prompts; the placeholder is for *intent*, not a banner.
  const display = (promptIntent.subject || "…").trim().slice(0, 28);

  if (promptIntent.kind === "object") {
    return (
      <group ref={group}>
        <ObjectIntentPlaceholder
          subject={promptIntent.subject}
          color={color}
          emissive={emissive}
        />
      </group>
    );
  }

  return (
    <group ref={group}>
      <FontErrorBoundary>
        <Suspense fallback={null}>
          <Center>
            <Text3D
              font={FONT_URL}
              size={0.85}
              height={0.18}
              curveSegments={12}
              bevelEnabled
              bevelThickness={0.012}
              bevelSize={0.012}
              bevelOffset={0}
              bevelSegments={3}
            >
              {display}
              <meshPhysicalMaterial
                color={color}
                emissive={emissive}
                emissiveIntensity={0.08}
                roughness={0.35}
                metalness={0.15}
                clearcoat={0.4}
                clearcoatRoughness={0.2}
              />
            </Text3D>
          </Center>
        </Suspense>
      </FontErrorBoundary>
    </group>
  );
}

function ObjectIntentPlaceholder({
  subject,
  color,
  emissive
}: {
  subject: string;
  color: string;
  emissive: string;
}) {
  const lower = subject.toLowerCase();
  const isVehicle = /\b(?:car|vehicle|truck|sedan|suv|bike|motorcycle)\b/.test(lower);

  if (isVehicle) {
    return (
      <group>
        <mesh position={[0, 0.05, 0]}>
          <boxGeometry args={[2.4, 0.45, 1.05]} />
          <meshPhysicalMaterial
            color={color}
            emissive={emissive}
            emissiveIntensity={0.04}
            roughness={0.42}
            metalness={0.18}
          />
        </mesh>
        <mesh position={[0.15, 0.48, 0]}>
          <boxGeometry args={[1.05, 0.5, 0.82]} />
          <meshPhysicalMaterial
            color={color}
            emissive={emissive}
            emissiveIntensity={0.035}
            roughness={0.34}
            metalness={0.12}
          />
        </mesh>
        {[-0.82, 0.82].map((x) =>
          [-0.56, 0.56].map((z) => (
            <mesh key={`${x}-${z}`} position={[x, -0.26, z]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.24, 0.24, 0.14, 24]} />
              <meshStandardMaterial color="#151515" roughness={0.6} metalness={0.2} />
            </mesh>
          ))
        )}
      </group>
    );
  }

  return (
    <group>
      <mesh>
        <icosahedronGeometry args={[0.92, 2]} />
        <meshPhysicalMaterial
          color={color}
          emissive={emissive}
          emissiveIntensity={0.06}
          roughness={0.38}
          metalness={0.16}
          clearcoat={0.3}
        />
      </mesh>
      <mesh position={[0, -0.82, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.86, 0.018, 8, 96]} />
        <meshBasicMaterial color={emissive} transparent opacity={0.28} />
      </mesh>
    </group>
  );
}
