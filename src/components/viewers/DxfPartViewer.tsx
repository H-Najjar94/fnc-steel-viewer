import { useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import {
  OrbitControls,
  Grid,
  Bounds,
  GizmoHelper,
  GizmoViewcube,
  Environment,
  Lightformer,
} from "@react-three/drei";
import { EffectComposer, N8AO, SMAA } from "@react-three/postprocessing";
import * as THREE from "three";
import type { Part } from "../../types";
import { readTextFile } from "../../lib/api";
import { buildDxfPlateGeometry, type DxfPlateResult } from "../../lib/dxfGeometry";
import { mm } from "../../lib/format";
import PanGesture from "./PanGesture";

// 3D plate reconstructed by extruding a per-part DXF cut outline — the fast,
// no-IFC path that mirrors the DSTV (.nc1) part view in projects that ship
// per-part DXF files instead of NC1.
export default function DxfPartViewer({ part }: { part: Part }) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wire, setWire] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  useEffect(() => {
    let alive = true;
    setText(null);
    setError(null);
    if (!part.dxf_path) return;
    readTextFile(part.dxf_path)
      .then((t) => alive && setText(t))
      .catch((e) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, [part.dxf_path]);

  const result: DxfPlateResult | null = useMemo(
    () => (text ? buildDxfPlateGeometry(text, part.flange_t_mm) : null),
    [text, part.flange_t_mm]
  );

  // Sit the part ON the grid (its lowest point at y=0) instead of centered
  // through the floor plane.
  const yOffset = useMemo(() => {
    if (!result) return 0;
    result.geometry.computeBoundingBox();
    return -(result.geometry.boundingBox?.min.y ?? 0);
  }, [result]);

  if (error) return <Center>{error}</Center>;
  if (text === null) return <Center>Reading DXF…</Center>;
  if (!result) return <Center>Couldn’t build 3D from this DXF outline.</Center>;

  const thick = result.meta.thicknessMm ?? part.flange_t_mm;

  return (
    <div className="relative h-full w-full">
      <Canvas
        camera={{ position: [2, 1.6, 2.4], fov: 45, near: 0.01, far: 1000 }}
        dpr={[1, 2]}
        gl={{ antialias: true }}
      >
        <color attach="background" args={["#d8dee8"]} />
        <ambientLight intensity={0.5} />
        <hemisphereLight intensity={0.6} color="#ffffff" groundColor="#9099a8" />
        <directionalLight position={[5, 8, 5]} intensity={1.0} />
        <directionalLight position={[-5, 3, -4]} intensity={0.35} />
        <Environment resolution={128} frames={1}>
          <Lightformer intensity={1.6} position={[0, 5, 0]} scale={[8, 8, 1]} />
          <Lightformer intensity={1.0} position={[5, 2, 5]} scale={[4, 4, 1]} />
          <Lightformer intensity={0.8} position={[-5, 2, -4]} scale={[4, 4, 1]} />
        </Environment>
        <Bounds key={resetKey} fit clip observe margin={1.2}>
          <mesh geometry={result.geometry} position={[0, yOffset, 0]}>
            <meshStandardMaterial
              color="#9aa7bd"
              metalness={0.15}
              roughness={0.6}
              wireframe={wire}
              side={THREE.DoubleSide}
            />
          </mesh>
        </Bounds>
        <Grid
          args={[10, 10]}
          cellColor="#c2cad6"
          sectionColor="#9aa7bd"
          infiniteGrid
          fadeDistance={30}
          position={[0, -0.001, 0]}
        />
        <OrbitControls makeDefault enableDamping dampingFactor={0.08} rotateSpeed={0.8} zoomSpeed={0.8} panSpeed={0.8} />
        <PanGesture />
        <GizmoHelper alignment="bottom-right" margin={[70, 70]}>
          <GizmoViewcube color="#1f2d49" textColor="#fff" strokeColor="#2c3a5a" />
        </GizmoHelper>
        <EffectComposer multisampling={4} enableNormalPass>
          <N8AO halfRes aoRadius={0.05} intensity={2.5} distanceFalloff={1} color="#0a0f1a" />
          <SMAA />
        </EffectComposer>
      </Canvas>

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3">
        <div className="pointer-events-auto rounded-lg bg-fnc-panel/90 px-3 py-2 text-xs backdrop-blur">
          <div className="font-semibold text-white">{part.mark}</div>
          <div className="text-fnc-steel">
            {[result.meta.material || part.material, thick ? `${mm(thick)} thick` : null]
              .filter(Boolean)
              .join(" · ")}
          </div>
          <div className="text-fnc-steel/70">
            from DXF · {result.holes} hole{result.holes === 1 ? "" : "s"}
          </div>
        </div>
        <div className="pointer-events-auto flex gap-1">
          <ToolBtn onClick={() => setWire((w) => !w)} active={wire}>
            Wireframe
          </ToolBtn>
          <ToolBtn onClick={() => setResetKey((k) => k + 1)}>Fit view</ToolBtn>
        </div>
      </div>
      <div className="pointer-events-none absolute bottom-2 left-3 text-[11px] text-fnc-steel/70">
        Drag to orbit · scroll to zoom · right-drag to pan
      </div>
    </div>
  );
}

function ToolBtn({
  children,
  onClick,
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md border border-fnc-border px-3 py-1.5 text-xs font-medium backdrop-blur transition ${
        active ? "bg-fnc-red text-white" : "bg-fnc-panel/90 text-fnc-steel hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center p-6 text-sm text-fnc-steel">{children}</div>
  );
}
