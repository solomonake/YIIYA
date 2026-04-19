"use client";

import { Environment, Float, Grid, OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useYiiyaStore, type SceneObject } from "@/lib/store";

function ObjectGeometry({ shape }: { shape: string }) {
  const normalizedShape = shape.toLowerCase();

  if (normalizedShape.includes("cube") || normalizedShape.includes("box")) {
    return <boxGeometry args={[1.4, 1.4, 1.4]} />;
  }

  if (normalizedShape.includes("torus") || normalizedShape.includes("ring")) {
    return <torusKnotGeometry args={[0.55, 0.14, 96, 12]} />;
  }

  return <sphereGeometry args={[0.72, 48, 48]} />;
}

function SceneObjectMesh({ object }: { object: SceneObject }) {
  const mesh = (
    <mesh position={object.position} rotation={[0.22, 0.7, 0.08]}>
      <ObjectGeometry shape={object.shape} />
      <meshStandardMaterial
        color={object.color}
        metalness={object.animation.toLowerCase().includes("glass") ? 0.05 : 0.25}
        roughness={object.animation.toLowerCase().includes("glass") ? 0.08 : 0.34}
        transparent={object.animation.toLowerCase().includes("glass")}
        opacity={object.animation.toLowerCase().includes("glass") ? 0.55 : 1}
      />
    </mesh>
  );

  if (
    object.animation.toLowerCase().includes("float") ||
    object.animation.toLowerCase().includes("spin") ||
    object.animation.toLowerCase().includes("rotate")
  ) {
    return (
      <Float speed={1.35} rotationIntensity={0.55} floatIntensity={0.38}>
        {mesh}
      </Float>
    );
  }

  return mesh;
}

function StarterScene({ objects }: { objects: SceneObject[] }) {
  return (
    <>
      <ambientLight intensity={0.65} />
      <directionalLight position={[5, 6, 4]} intensity={2.2} color="#fff6df" />
      <pointLight position={[-4, 1.6, -3]} intensity={1.1} color="#EF9F27" />

      {objects.map((object) => (
        <SceneObjectMesh key={object.id} object={object} />
      ))}

      <Grid
        position={[0, -0.02, 0]}
        args={[12, 12]}
        cellSize={0.6}
        cellThickness={0.5}
        cellColor="#2a2a2a"
        sectionSize={2.4}
        sectionThickness={0.9}
        sectionColor="#EF9F27"
        fadeDistance={18}
        fadeStrength={1.6}
      />
      <Environment preset="city" />
    </>
  );
}

export function SceneCanvas() {
  const sceneObjects = useYiiyaStore((state) => state.sceneObjects);
  const hasBuildContent = sceneObjects.length > 0;

  return (
    <Canvas
      data-yiiya-scene-canvas="true"
      camera={{ position: [3.9, 3.2, 5.2], fov: 42 }}
      gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
      dpr={[1, 2]}
      className="h-full w-full"
    >
      <color attach="background" args={["#0a0a0a"]} />
      <fog attach="fog" args={["#0a0a0a", 6, 16]} />
      {hasBuildContent ? <StarterScene objects={sceneObjects} /> : null}
      <OrbitControls
        enablePan={false}
        minDistance={3.2}
        maxDistance={8}
        maxPolarAngle={Math.PI * 0.48}
      />
    </Canvas>
  );
}
