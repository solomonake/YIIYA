"use client";

/**
 * <Stage /> — the lifecycle-aware 3D root.
 *
 * Drop this into your R3F <Canvas> in place of the old always-mounted blob.
 *
 *   <Canvas>
 *     <ambientLight intensity={0.4} />
 *     <directionalLight position={[5, 5, 5]} intensity={0.8} />
 *     <Stage state={stage} />
 *   </Canvas>
 *
 * The component renders nothing for EMPTY/ERROR; a typographic word for
 * INTENT; the dissolving cloud for GENERATING; the real GLB for READY.
 */
import { Suspense } from "react";
import type { StageState } from "@/lib/scene/stage-state";
import { TypographicPlaceholder } from "./typographic-placeholder";
import { ParticleDissolve } from "./particle-dissolve";
import { GeneratedMesh } from "./generated-mesh";

export type StageProps = {
  state: StageState;
  lodBase?: string;
};

export function Stage({ state, lodBase }: StageProps) {
  switch (state.kind) {
    case "EMPTY":
      return null;

    case "INTENT":
      return <TypographicPlaceholder text={state.promptText} />;

    case "GENERATING":
      return (
        <group>
          <TypographicPlaceholder text={state.promptText} spinRate={0.45} />
          <ParticleDissolve progress={state.progress} />
        </group>
      );

    case "READY":
      return (
        <Suspense fallback={<ParticleDissolve progress={0.5} />}>
          <GeneratedMesh url={state.glbUrl} lodBase={lodBase} />
        </Suspense>
      );

    case "ERROR":
      // Show nothing visible; an HTML overlay should communicate the error.
      return null;
  }
}
