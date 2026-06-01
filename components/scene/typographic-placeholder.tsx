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

  useFrame((_, dt) => {
    if (!group.current) return;
    group.current.rotation.y += spinRate * dt;
  });

  // Crop overlong prompts; the placeholder is for *intent*, not a banner.
  const display = (text || "…").trim().slice(0, 28);

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
