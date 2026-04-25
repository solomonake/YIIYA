"use client";

import {
  Environment,
  Float,
  Grid,
  MeshDistortMaterial,
  OrbitControls,
  useGLTF
} from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import type { ElementRef } from "react";
import type { Group, Mesh, Points } from "three";
import type { ThreeEvent } from "@react-three/fiber";
import { materialPresets } from "@/lib/materials";
import { useYiiyaStore, type SceneObject, type SpatialAnchor } from "@/lib/store";
import { registerExportObject, registerExportRoot } from "@/lib/spatial-export";

function ObjectGeometry({ shape }: { shape: string }) {
  const normalizedShape = shape.toLowerCase();

  if (normalizedShape.includes("cube") || normalizedShape.includes("box")) {
    return <boxGeometry args={[1.4, 1.4, 1.4]} />;
  }

  if (normalizedShape.includes("plane") || normalizedShape.includes("panel")) {
    return <planeGeometry args={[2.4, 1.35, 8, 8]} />;
  }

  if (normalizedShape.includes("cylinder")) {
    return <cylinderGeometry args={[0.58, 0.58, 1.5, 48]} />;
  }

  if (normalizedShape.includes("cone")) {
    return <coneGeometry args={[0.72, 1.6, 48]} />;
  }

  if (normalizedShape.includes("capsule")) {
    return <capsuleGeometry args={[0.46, 1.15, 12, 32]} />;
  }

  if (normalizedShape.includes("torus") || normalizedShape.includes("ring")) {
    return <torusKnotGeometry args={[0.55, 0.14, 96, 12]} />;
  }

  return <sphereGeometry args={[0.72, 48, 48]} />;
}

function SemanticMockup({
  shape,
  color,
  materialPreset
}: {
  shape: string;
  color: string;
  materialPreset: Record<string, any>;
}) {
  if (shape === "device-laptop") {
    return (
      <group>
        <mesh position={[0, -0.18, 0]} rotation={[-0.08, 0, 0]}>
          <boxGeometry args={[1.8, 0.08, 1.18]} />
          <meshPhysicalMaterial color={color} {...materialPreset} />
        </mesh>
        <mesh position={[0, 0.26, -0.44]} rotation={[-0.9, 0, 0]}>
          <boxGeometry args={[1.72, 1.02, 0.06]} />
          <meshPhysicalMaterial color="#171B24" {...materialPreset} />
        </mesh>
      </group>
    );
  }

  if (shape === "vehicle-sedan") {
    return (
      <group>
        <mesh position={[0, 0.05, 0]}>
          <boxGeometry args={[1.8, 0.42, 0.86]} />
          <meshPhysicalMaterial color={color} {...materialPreset} />
        </mesh>
        <mesh position={[0.04, 0.34, 0]} scale={[1.15, 0.65, 0.82]}>
          <sphereGeometry args={[0.48, 32, 32]} />
          <meshPhysicalMaterial color={color} {...materialPreset} />
        </mesh>
        {[-0.58, 0.58].map((x) => (
          <mesh key={x} position={[x, -0.22, 0.42]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.16, 0.16, 0.14, 20]} />
            <meshPhysicalMaterial color="#111111" metalness={0.9} roughness={0.35} />
          </mesh>
        ))}
        {[-0.58, 0.58].map((x) => (
          <mesh key={`${x}-rear`} position={[x, -0.22, -0.42]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.16, 0.16, 0.14, 20]} />
            <meshPhysicalMaterial color="#111111" metalness={0.9} roughness={0.35} />
          </mesh>
        ))}
      </group>
    );
  }

  if (shape === "furniture-chair") {
    return (
      <group>
        <mesh position={[0, 0.18, 0]}>
          <boxGeometry args={[0.96, 0.12, 0.98]} />
          <meshPhysicalMaterial color={color} {...materialPreset} />
        </mesh>
        <mesh position={[0, 0.88, -0.36]}>
          <boxGeometry args={[0.96, 1.18, 0.12]} />
          <meshPhysicalMaterial color={color} {...materialPreset} />
        </mesh>
        {[
          [-0.36, -0.46, -0.32],
          [0.36, -0.46, -0.32],
          [-0.36, -0.46, 0.32],
          [0.36, -0.46, 0.32]
        ].map((position, index) => (
          <mesh key={index} position={position as [number, number, number]}>
            <cylinderGeometry args={[0.05, 0.05, 0.98, 12]} />
            <meshPhysicalMaterial color={color} {...materialPreset} />
          </mesh>
        ))}
      </group>
    );
  }

  if (shape === "apparel-shoe") {
    return (
      <group rotation={[0, -0.3, 0]}>
        <mesh position={[0, 0.08, 0]}>
          <capsuleGeometry args={[0.36, 1.12, 10, 18]} />
          <meshPhysicalMaterial color={color} {...materialPreset} />
        </mesh>
        <mesh position={[0.28, 0.06, 0.02]} scale={[0.58, 0.44, 0.92]}>
          <sphereGeometry args={[0.34, 20, 20]} />
          <meshPhysicalMaterial color={color} {...materialPreset} />
        </mesh>
      </group>
    );
  }

  if (shape === "portrait-bust") {
    return (
      <group>
        <mesh position={[0, 0.58, 0]}>
          <sphereGeometry args={[0.42, 28, 28]} />
          <meshPhysicalMaterial color={color} {...materialPreset} />
        </mesh>
        <mesh position={[0, -0.04, 0]} scale={[0.78, 1.1, 0.62]}>
          <capsuleGeometry args={[0.34, 0.76, 8, 18]} />
          <meshPhysicalMaterial color={color} {...materialPreset} />
        </mesh>
      </group>
    );
  }

  if (shape === "pedestal-plinth") {
    return (
      <mesh>
        <cylinderGeometry args={[0.74, 0.94, 0.72, 28]} />
        <meshPhysicalMaterial color={color} {...materialPreset} />
      </mesh>
    );
  }

  return (
    <mesh>
      <ObjectGeometry shape={shape} />
      <meshPhysicalMaterial color={color} {...materialPreset} />
    </mesh>
  );
}

function SceneObjectMesh({
  object,
  anchor
}: {
  object: SceneObject;
  anchor?: SpatialAnchor;
}) {
  const meshRef = useRef<Group>(null);
  const materialPreset = {
    ...materialPresets[object.material],
    ...object.materialOverrides
  };
  const updateSceneObjectLive = useYiiyaStore((state) => state.updateSceneObjectLive);
  const draggingRef = useRef(false);

  useEffect(() => {
    registerExportObject(object.id, meshRef.current);

    return () => registerExportObject(object.id, null);
  }, [object.id]);

  useFrame((state) => {
    if (!meshRef.current) {
      return;
    }

    if (
      object.animation.toLowerCase().includes("rotate") ||
      object.animation.toLowerCase().includes("spin")
    ) {
      meshRef.current.rotation.y += 0.01 * object.intensity;
    }

    if (object.animation.toLowerCase().includes("pulse")) {
      const pulse = 1 + Math.sin(state.clock.elapsedTime * 2) * 0.08;
      meshRef.current.scale.set(
        object.scale[0] * pulse,
        object.scale[1] * pulse,
        object.scale[2] * pulse
      );
    }
  });

  const handlePointerDown = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    draggingRef.current = true;
  };

  const handlePointerMove = (event: ThreeEvent<PointerEvent>) => {
    if (!draggingRef.current) {
      return;
    }

    event.stopPropagation();
    updateSceneObjectLive(object.id, {
      position: [event.point.x, event.point.y, event.point.z]
    });
  };

  const handlePointerUp = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    draggingRef.current = false;
  };

  const mesh = (
    <group
      ref={meshRef}
      position={anchor?.worldPosition ?? object.position}
      rotation={[0.22, 0.7, 0.08]}
      scale={object.scale}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerOut={handlePointerUp}
    >
      <SemanticMockup
        shape={object.shape}
        color={object.color}
        materialPreset={materialPreset}
      />
    </group>
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

function LoadedMeshObject({
  object,
  anchor
}: {
  object: SceneObject;
  anchor?: SpatialAnchor;
}) {
  const groupRef = useRef<Group>(null);
  const gltf = useGLTF(object.meshUrl ?? "");
  const updateSceneObjectLive = useYiiyaStore((state) => state.updateSceneObjectLive);
  const draggingRef = useRef(false);

  useEffect(() => {
    registerExportObject(object.id, groupRef.current);

    return () => registerExportObject(object.id, null);
  }, [object.id]);

  useFrame((state) => {
    if (!groupRef.current) {
      return;
    }

    groupRef.current.rotation.y += 0.004 * object.intensity;
    groupRef.current.position.y =
      (anchor?.worldPosition[1] ?? object.position[1]) +
      Math.sin(state.clock.elapsedTime * 1.2) * 0.05;
  });

  return (
    <primitive
      ref={groupRef}
      object={gltf.scene}
      position={anchor?.worldPosition ?? object.position}
      scale={object.scale}
      onPointerDown={(event: ThreeEvent<PointerEvent>) => {
        event.stopPropagation();
        draggingRef.current = true;
      }}
      onPointerMove={(event: ThreeEvent<PointerEvent>) => {
        if (!draggingRef.current) {
          return;
        }

        event.stopPropagation();
        updateSceneObjectLive(object.id, {
          position: [event.point.x, event.point.y, event.point.z]
        });
      }}
      onPointerUp={(event: ThreeEvent<PointerEvent>) => {
        event.stopPropagation();
        draggingRef.current = false;
      }}
      onPointerOut={(event: ThreeEvent<PointerEvent>) => {
        event.stopPropagation();
        draggingRef.current = false;
      }}
    />
  );
}

function DefaultBlob({ subdued }: { subdued: boolean }) {
  const meshRef = useRef<Mesh>(null);
  const pointsRef = useRef<Points>(null);
  const materialRef = useRef<ElementRef<typeof MeshDistortMaterial>>(null);
  const blobState = useYiiyaStore((state) => state.blobState);
  const currentDistortRef = useRef(0.5);
  const currentSpeedRef = useRef(1.8);
  const particles = useMemo(() => {
    const count = Math.floor(Math.max(1000, Math.min(22000, blobState.particleDensity)));
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const golden = Math.PI * (3 - Math.sqrt(5));

    for (let index = 0; index < count; index += 1) {
      const t = count <= 1 ? 0 : index / (count - 1);
      let x = 0;
      let y = 0;
      let z = 0;

      if (blobState.formation === "helix") {
        const angle = index * 0.16;
        const radius = 0.72 + Math.sin(t * Math.PI * 6) * 0.08;
        x = Math.cos(angle) * radius;
        z = Math.sin(angle) * radius;
        y = (t - 0.5) * 2.8;
      } else if (blobState.formation === "torus") {
        const angle = index * golden;
        const ring = Math.floor(index / Math.max(1, Math.sqrt(count)));
        const tubeAngle = ring * 0.27;
        const major = 0.92;
        const minor = 0.22;
        x = (major + minor * Math.cos(tubeAngle)) * Math.cos(angle);
        z = (major + minor * Math.cos(tubeAngle)) * Math.sin(angle);
        y = minor * Math.sin(tubeAngle);
      } else if (blobState.formation === "bottle") {
        const angle = index * golden;
        const height = (t - 0.5) * 2.7;
        const neck = t > 0.68 ? 0.34 : 0.72;
        const shoulder = t > 0.58 && t <= 0.68 ? 0.72 - (t - 0.58) * 3.8 : neck;
        const radius = Math.max(0.22, shoulder + Math.sin(t * Math.PI) * 0.1);
        x = Math.cos(angle) * radius;
        z = Math.sin(angle) * radius;
        y = height;
      } else if (blobState.formation === "capsule") {
        const angle = index * golden;
        const radius = 0.48 + Math.sin(t * Math.PI) * 0.16;
        x = Math.cos(angle) * radius;
        z = Math.sin(angle) * radius;
        y = (t - 0.5) * 2.2;
      } else if (blobState.formation === "cube") {
        const side = Math.ceil(Math.cbrt(count));
        const xi = (index % side) / side - 0.5;
        const yi = (Math.floor(index / side) % side) / side - 0.5;
        const zi = (Math.floor(index / (side * side)) % side) / side - 0.5;
        x = xi * 1.8;
        y = yi * 1.8;
        z = zi * 1.8;
      } else if (blobState.formation === "wave") {
        const cols = Math.ceil(Math.sqrt(count));
        x = ((index % cols) / cols - 0.5) * 2.8;
        z = (Math.floor(index / cols) / cols - 0.5) * 2.2;
        y = Math.sin(x * 4 + z * 2) * 0.28;
      } else {
        const yPos = 1 - 2 * t;
        const radius = Math.sqrt(Math.max(0, 1 - yPos * yPos));
        const theta = golden * index;
        x = Math.cos(theta) * radius;
        y = yPos;
        z = Math.sin(theta) * radius;
      }

      const chaos = blobState.chaos * 0.12;
      positions[index * 3] = x + Math.sin(index * 12.9898) * chaos;
      positions[index * 3 + 1] = y * Math.max(0.55, blobState.aspectRatio) + Math.cos(index * 4.1414) * chaos;
      positions[index * 3 + 2] = z + Math.sin(index * 7.777) * chaos;
      colors[index * 3] = 0.8 + t * 0.2;
      colors[index * 3 + 1] = 0.42 + (1 - t) * 0.34;
      colors[index * 3 + 2] = 0.12 + blobState.glow * 0.24;
    }

    return { positions, colors };
  }, [
    blobState.aspectRatio,
    blobState.chaos,
    blobState.formation,
    blobState.glow,
    blobState.particleDensity
  ]);

  useFrame((_state, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += 0.003;
      meshRef.current.rotation.z = Math.sin(_state.clock.elapsedTime * 0.35) * blobState.twist * 0.08;
    }

    if (pointsRef.current) {
      pointsRef.current.rotation.y += 0.0018 + blobState.speed * 0.0008;
      pointsRef.current.rotation.z = Math.sin(_state.clock.elapsedTime * 0.24) * blobState.twist * 0.08;
    }

    currentDistortRef.current += (blobState.distort - currentDistortRef.current) * 0.18;
    currentSpeedRef.current += (blobState.speed - currentSpeedRef.current) * 0.12;

    if (materialRef.current) {
      materialRef.current.distort = currentDistortRef.current;
      materialRef.current.time += delta * currentSpeedRef.current;
    }
  });

  const scale =
    blobState.targetShape === "bottle"
      ? [0.72, 1.45 * blobState.aspectRatio, 0.72]
      : blobState.targetShape === "cube"
        ? [1.05, 1.05, 1.05]
        : blobState.targetShape === "crystal"
          ? [0.86, 1.35, 0.86]
          : blobState.targetShape === "organic"
            ? [1.15, 0.92, 1.05]
          : blobState.formation === "helix"
            ? [0.72, 1.45, 0.72]
            : blobState.formation === "torus"
              ? [1.1, 0.72, 1.1]
      : [1, 1, 1];
  const materialPreset = materialPresets[blobState.material] ?? materialPresets.carbon;

  return (
    <group position={subdued ? [2.35, 0.1, -1.65] : [0, 0, 0]}>
      <points ref={pointsRef} scale={subdued ? 0.48 : 0.82}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[particles.positions, 3]}
          />
          <bufferAttribute attach="attributes-color" args={[particles.colors, 3]} />
        </bufferGeometry>
        <pointsMaterial
          vertexColors
          size={subdued ? 0.012 : 0.017}
          transparent
          opacity={subdued ? 0.28 : 0.56 + blobState.glow * 0.22}
          depthWrite={false}
        />
      </points>
      <mesh
        ref={meshRef}
        scale={(subdued
          ? scale.map((value) => value * 0.5)
          : scale) as [number, number, number]}
      >
        <sphereGeometry args={[1.2, 64, 64]} />
        <MeshDistortMaterial
          ref={materialRef}
          color={"color" in materialPreset && typeof materialPreset.color === "string" ? materialPreset.color : "#1a1a1a"}
          distort={currentDistortRef.current}
          speed={0}
          roughness={typeof materialPreset.roughness === "number" ? materialPreset.roughness : 0.1}
          metalness={typeof materialPreset.metalness === "number" ? materialPreset.metalness : 0.4}
          transparent
          opacity={subdued ? 0.22 : Math.min(0.92, 0.5 + blobState.glow * 0.22)}
        />
      </mesh>
    </group>
  );
}

function StarterScene({
  objects,
  anchors,
  subduedBlob
}: {
  objects: SceneObject[];
  anchors: SpatialAnchor[];
  subduedBlob: boolean;
}) {
  const anchorMap = useMemo(
    () => new Map(anchors.map((anchor) => [anchor.objectId, anchor])),
    [anchors]
  );

  return (
    <>
      {objects.length === 0 ? (
        <DefaultBlob subdued={subduedBlob} />
      ) : null}

      {objects.map((object) =>
        object.meshUrl ? (
          <LoadedMeshObject
            key={object.id}
            object={object}
            anchor={anchorMap.get(object.id)}
          />
        ) : (
          <SceneObjectMesh
            key={object.id}
            object={object}
            anchor={anchorMap.get(object.id)}
          />
        )
      )}

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
  const spatialAnchors = useYiiyaStore((state) => state.spatialAnchors);
  const canvasMode = useYiiyaStore((state) => state.canvasMode);
  const hasSections = useYiiyaStore((state) => state.sections.length > 0);
  const rootGroupRef = useRef<Group>(null);

  useEffect(() => {
    window.dispatchEvent(new Event("resize"));
  }, []);

  useEffect(() => {
    registerExportRoot(rootGroupRef.current);

    return () => registerExportRoot(null);
  }, []);

  return (
    <div
      className="absolute inset-0 z-0 transition-opacity"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        opacity: canvasMode === "WEB" ? 0 : canvasMode === "HYBRID" ? 0.48 : 1,
        pointerEvents: canvasMode === "3D" ? "auto" : "none"
      }}
    >
      <Canvas
        data-yiiya-scene-canvas="true"
        gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
        camera={{ position: [0, 0, 5], fov: 60 }}
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: canvasMode === "3D" ? "auto" : "none"
        }}
        dpr={[1, 2]}
        className="h-full w-full"
      >
        {canvasMode === "3D" ? <color attach="background" args={["#050505"]} /> : null}
        <fog attach="fog" args={["#050505", 6, 16]} />
        <ambientLight intensity={0.9} />
        <directionalLight position={[3, 4, 5]} intensity={2.2} color="#fff6df" />
        <pointLight position={[-3, 2.4, 3]} intensity={1.4} color="#EF9F27" />
        <group ref={rootGroupRef}>
          <StarterScene
            objects={sceneObjects}
            anchors={spatialAnchors}
            subduedBlob={canvasMode === "HYBRID" && hasSections}
          />
        </group>
        <OrbitControls
          enabled={canvasMode === "3D"}
          enablePan={false}
          maxDistance={12}
          maxPolarAngle={Math.PI * 0.48}
        />
      </Canvas>
    </div>
  );
}
