import { useEffect, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import {
  OrbitControls,
  Grid,
  GizmoHelper,
  GizmoViewcube,
  Environment,
  Lightformer,
} from "@react-three/drei";
import { EffectComposer, N8AO, SMAA } from "@react-three/postprocessing";
import * as THREE from "three";
import { loadIfcModel } from "../../lib/ifc";
import { useStore } from "../../store";
import PanGesture from "./PanGesture";

const PALETTE: Record<string, number> = {
  Column: 0x3b82c4,
  Beam: 0xe0922f,
  Plate: 0x9aa7bd,
  Member: 0x57b87a,
  Other: 0xb0b6c2,
};

// Frame the camera onto an object once it is in the scene.
function FrameObject({ object, nonce }: { object: THREE.Object3D; nonce: number }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const controls = useThree((s) => s.controls) as any;
  useEffect(() => {
    const box = new THREE.Box3().setFromObject(object);
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z, 1) * 0.5;
    const dist = (radius / Math.tan((camera.fov * Math.PI) / 360)) * 1.9;
    const dir = new THREE.Vector3(1, 0.8, 1).normalize();
    camera.position.copy(center).addScaledVector(dir, dist);
    camera.near = Math.max(dist / 2000, 0.01);
    camera.far = dist * 2000;
    camera.updateProjectionMatrix();
    if (controls) {
      controls.target.copy(center);
      controls.update();
    }
  }, [object, nonce, camera, controls]);
  return null;
}

export default function IfcPartViewer({
  path,
  partMark,
  name,
  profile,
}: {
  path: string;
  partMark: string;
  name?: string;
  profile?: string;
}) {
  const [group, setGroup] = useState<THREE.Group | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [pct, setPct] = useState(0);
  const [wire, setWire] = useState(false);
  const [homeNonce, setHomeNonce] = useState(0);
  const footprintRef = useRef(2);
  // Saved part-mark -> expressIDs index lets us skip the mark scan entirely.
  const knownIds = useStore((s) => s.ifcPartIndex.get(partMark.toLowerCase()));

  useEffect(() => {
    let alive = true;
    setGroup(null);
    setStatus("loading");
    setPct(0);
    loadIfcModel(path, (f) => alive && setPct(Math.round(f * 100)))
      .then((m) =>
        m.getPartGroup(partMark, (d, t) => alive && setPct(t ? Math.round((d / t) * 100) : 0), knownIds)
      )
      .then((g) => {
        if (!alive) return;
        if (!g) {
          setStatus("missing");
          return;
        }
        // Recolor by category + record size for tooling.
        g.traverse((o: any) => {
          if (o.userData?.isEdge && o.material) {
            o.material.color.set(0x33405a);
            o.material.opacity = 0.5;
            o.material.transparent = true;
          } else if (o.isMesh) {
            const cat = (o.userData?.category as string) ?? "Other";
            const mat = o.material as THREE.MeshStandardMaterial;
            mat.color.set(PALETTE[cat] ?? PALETTE.Other);
            mat.metalness = 0.3;
            mat.roughness = 0.55;
            mat.side = THREE.DoubleSide;
          }
        });
        const size = new THREE.Box3().setFromObject(g).getSize(new THREE.Vector3());
        footprintRef.current = Math.max(size.x, size.y, size.z, 1);
        setGroup(g);
        setStatus("ready");
      })
      .catch((e) => {
        console.error(e);
        if (alive) setStatus("error");
      });
    return () => {
      alive = false;
    };
  }, [path, partMark, knownIds]);

  if (status === "missing")
    return (
      <Center>
        <div className="max-w-sm text-center">
          <p className="mb-2 text-white">Part “{partMark}” isn’t in the 3D model.</p>
          <p className="text-sm text-fnc-steel">
            No element in the IFC carries this part mark. Try its <b>Drawing</b> tab instead.
          </p>
        </div>
      </Center>
    );
  if (status === "error") return <Center>Couldn’t read this part from the IFC model.</Center>;
  if (status === "loading" || !group)
    return (
      <Center>
        <div className="text-center">
          <div className="mb-1 text-white">Building part 3D… {pct}%</div>
          <div className="text-xs text-fnc-steel/70">Reading geometry from the IFC model.</div>
        </div>
      </Center>
    );

  const fp = footprintRef.current;
  return (
    <div className="relative h-full w-full">
      <Canvas dpr={[1, 2]} gl={{ antialias: true }} camera={{ position: [2, 1.6, 2.4], fov: 45, near: 0.01, far: 1e6 }}>
        <color attach="background" args={["#d8dee8"]} />
        <ambientLight intensity={0.5} />
        <hemisphereLight intensity={0.6} color="#ffffff" groundColor="#9099a8" />
        <directionalLight position={[fp, fp * 2, fp]} intensity={1.0} />
        <directionalLight position={[-fp, fp, -fp]} intensity={0.35} />
        <Environment resolution={128} frames={1}>
          <Lightformer intensity={1.6} position={[0, 5, 0]} scale={[8, 8, 1]} />
          <Lightformer intensity={1.0} position={[5, 2, 5]} scale={[4, 4, 1]} />
          <Lightformer intensity={0.8} position={[-5, 2, -4]} scale={[4, 4, 1]} />
        </Environment>
        <primitive
          object={group}
          onUpdate={(self: THREE.Object3D) =>
            self.traverse((o: any) => {
              if (o.isMesh && o.material) o.material.wireframe = wire;
            })
          }
        />
        <Grid
          args={[10, 10]}
          cellSize={fp / 10}
          cellColor="#c2cad6"
          sectionColor="#9aa7bd"
          infiniteGrid
          fadeDistance={fp * 12}
        />
        <FrameObject object={group} nonce={homeNonce} />
        <OrbitControls makeDefault enableDamping dampingFactor={0.08} rotateSpeed={0.8} zoomSpeed={0.8} panSpeed={0.8} />
        <PanGesture />
        <GizmoHelper alignment="bottom-right" margin={[70, 70]}>
          <GizmoViewcube color="#1f2d49" textColor="#fff" strokeColor="#2c3a5a" />
        </GizmoHelper>
        <EffectComposer multisampling={4} enableNormalPass>
          <N8AO halfRes aoRadius={Math.min(Math.max(fp * 0.02, 0.05), 3)} intensity={2.5} distanceFalloff={1} color="#0a0f1a" />
          <SMAA />
        </EffectComposer>
      </Canvas>

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3">
        <div className="pointer-events-auto rounded-lg bg-fnc-panel/90 px-3 py-2 text-xs backdrop-blur">
          <div className="font-semibold text-white">{partMark}</div>
          {(name || profile) && (
            <div className="text-fnc-steel">{[name, profile].filter(Boolean).join(" · ")}</div>
          )}
          <div className="text-fnc-steel/70">from IFC model</div>
        </div>
        <div className="pointer-events-auto flex gap-1">
          <ToolBtn onClick={() => setWire((w) => !w)} active={wire}>
            Wireframe
          </ToolBtn>
          <ToolBtn onClick={() => setHomeNonce((n) => n + 1)}>Fit view</ToolBtn>
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
