import { useEffect, useMemo, useState, Suspense, lazy } from "react";
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
import type { Part, PartGeometry } from "../../types";
import { getPartGeometry } from "../../lib/api";
import { buildGeometry } from "../../lib/dstvGeometry";
import { mm, kg } from "../../lib/format";
import PanGesture from "./PanGesture";

const IfcViewer = lazy(() => import("./IfcViewer"));
const IfcPartViewer = lazy(() => import("./IfcPartViewer"));
const DxfPartViewer = lazy(() => import("./DxfPartViewer"));

export default function Viewer3D({
  part,
  ifcPath,
  isAssembly,
  assemblyMark,
}: {
  part?: Part;
  ifcPath: string | null;
  isAssembly: boolean;
  assemblyMark?: string;
}) {
  // Assemblies: only an IFC building model can place them in 3D.
  if (isAssembly) {
    if (ifcPath)
      return (
        <Suspense fallback={<Center>Loading 3D model…</Center>}>
          <IfcViewer path={ifcPath} assemblyMark={assemblyMark} />
        </Suspense>
      );
    return (
      <Center>
        <div className="max-w-sm text-center">
          <p className="mb-2 text-white">No assembled 3D model available.</p>
          <p className="text-sm text-fnc-steel">
            A full building view needs an <b>IFC</b> export dropped into the project folder.
            Meanwhile, open this assembly's <b>Drawing</b> tab, or select one of its single
            parts to see it in 3D.
          </p>
        </div>
      </Center>
    );
  }

  // DSTV reconstruction when the part has a CNC file.
  if (part?.nc1_path) return <PartScene part={part} />;

  // Per-part DXF cut file: extrude the outline — fast, no IFC, no extraction.
  if (part?.dxf_path)
    return (
      <Suspense fallback={<Center>Loading 3D…</Center>}>
        <DxfPartViewer part={part} />
      </Suspense>
    );

  // Otherwise, if the project has an IFC, show this part isolated from the model
  // (parts that exist only in the IFC — e.g. profiles with no DXF/.nc1).
  if (part && ifcPath)
    return (
      <Suspense fallback={<Center>Loading 3D model…</Center>}>
        <IfcPartViewer path={ifcPath} partMark={part.mark} name={part.name} profile={part.profile} />
      </Suspense>
    );

  return <Center>No 3D geometry for this item.</Center>;
}

function PartScene({ part }: { part: Part }) {
  const [geo, setGeo] = useState<PartGeometry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wire, setWire] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  useEffect(() => {
    let alive = true;
    setGeo(null);
    setError(null);
    getPartGeometry(part.nc1_path!)
      .then((g) => alive && setGeo(g))
      .catch((e) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, [part.nc1_path]);

  const geometry = useMemo(() => (geo ? buildGeometry(geo) : null), [geo]);
  const holeSize = useMemo(() => {
    if (!geo) return 0.02;
    return Math.max(Math.min(Math.max(geo.length_mm, geo.width_mm) * 0.000012, 0.08), 0.01);
  }, [geo]);

  if (error) return <Center>{error}</Center>;
  if (!geometry) return <Center>Building 3D…</Center>;

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
        {/* In-scene environment so the metal reads as steel, not black. */}
        <Environment resolution={128} frames={1}>
          <Lightformer intensity={1.6} position={[0, 5, 0]} scale={[8, 8, 1]} />
          <Lightformer intensity={1.0} position={[5, 2, 5]} scale={[4, 4, 1]} />
          <Lightformer intensity={0.8} position={[-5, 2, -4]} scale={[4, 4, 1]} />
        </Environment>
        <Bounds key={resetKey} fit clip observe margin={1.2}>
          <group>
            <mesh geometry={geometry}>
              <meshStandardMaterial
                color={part.category === "Plate" ? "#9aa7bd" : "#c0202a"}
                metalness={0.1}
                roughness={0.6}
                wireframe={wire}
                side={THREE.DoubleSide}
              />
            </mesh>
            {geo && geo.holes.length > 0 && <HoleMarkers geo={geo} size={holeSize} />}
          </group>
        </Bounds>
        <Grid
          args={[10, 10]}
          cellColor="#c2cad6"
          sectionColor="#9aa7bd"
          infiniteGrid
          fadeDistance={30}
          position={[0, -0.001, 0]}
        />
        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.08}
          rotateSpeed={0.8}
          zoomSpeed={0.8}
          panSpeed={0.8}
        />
        <PanGesture />
        <GizmoHelper alignment="bottom-right" margin={[70, 70]}>
          <GizmoViewcube color="#1f2d49" textColor="#fff" strokeColor="#2c3a5a" />
        </GizmoHelper>
        <EffectComposer multisampling={4} enableNormalPass>
          <N8AO halfRes aoRadius={0.05} intensity={2.5} distanceFalloff={1} color="#0a0f1a" />
          <SMAA />
        </EffectComposer>
      </Canvas>

      {/* tools */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3">
        <div className="pointer-events-auto rounded-lg bg-fnc-panel/90 px-3 py-2 text-xs backdrop-blur">
          <div className="font-semibold text-white">{geo!.profile}</div>
          <div className="text-fnc-steel">
            L {mm(geo!.length_mm)} ·{" "}
            {geo!.kind === "plate"
              ? `${mm(geo!.height_mm)} × ${mm(geo!.thickness_mm)}`
              : `H ${mm(geo!.height_mm)}`}
          </div>
          <div className="text-fnc-steel">{kg(part.weight_kg)} · {geo!.holes.length} holes</div>
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
    <div className="flex h-full items-center justify-center p-6 text-sm text-fnc-steel">
      {children}
    </div>
  );
}

function HoleMarkers({ geo, size }: { geo: PartGeometry; size: number }) {
  const S = 0.001;
  return (
    <>
      {geo.holes.map((h, i) => {
        const x = (h.x - geo.width_mm / 2) * S;
        const y = (geo.length_mm / 2 - h.y) * S;
        const z = Math.max(geo.height_mm, 1) * S * 0.5 + size * 0.1;
        const r = Math.max((h.d / 2) * S, size * 0.65);
        return (
          <mesh key={`${i}-${h.x}-${h.y}`} position={[x, y, z]} renderOrder={10}>
            <circleGeometry args={[r, 20]} />
            <meshBasicMaterial color="#d8dee8" depthWrite={false} depthTest />
          </mesh>
        );
      })}
    </>
  );
}
