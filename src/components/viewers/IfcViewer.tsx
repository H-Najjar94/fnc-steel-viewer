import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import {
  OrbitControls,
  Grid,
  GizmoHelper,
  GizmoViewcube,
  ContactShadows,
  Environment,
  Lightformer,
} from "@react-three/drei";
import { EffectComposer, N8AO, SMAA } from "@react-three/postprocessing";
import * as THREE from "three";
import { loadIfcModel, type IfcModel, type Category } from "../../lib/ifc";
import { basename } from "../../lib/format";
import { useStore } from "../../store";
import PanGesture from "./PanGesture";

const PALETTE: Record<Category, number> = {
  Column: 0x3b82c4,
  Beam: 0xe0922f,
  Plate: 0x9aa7bd,
  Member: 0x57b87a,
  Other: 0xb0b6c2,
};
const STEEL = 0x9aa7bd;
const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;

const STYLES = {
  flat: { metalness: 0.05, roughness: 0.85, edge: 0, edgeColor: 0x7a8699 },
  balanced: { metalness: 0.22, roughness: 0.62, edge: 0.14, edgeColor: 0x7a8699 },
  metallic: { metalness: 0.5, roughness: 0.48, edge: 0.45, edgeColor: 0x0f1626 },
} as const;

function FirstHitOnly() {
  const raycaster = useThree((s) => s.raycaster);
  useEffect(() => {
    (raycaster as any).firstHitOnly = true;
  }, [raycaster]);
  return null;
}

function FrameObject({ object, nonce }: { object: THREE.Object3D; nonce: number }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const controls = useThree((s) => s.controls) as any;
  useEffect(() => {
    const box = new THREE.Box3().setFromObject(object);
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z, 1) * 0.5;
    const dist = (radius / Math.tan((camera.fov * Math.PI) / 360)) * 1.8;
    const dir = new THREE.Vector3(1, 1, 1).normalize();
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

export default function IfcViewer({ path, assemblyMark }: { path: string; assemblyMark?: string }) {
  const [model, setModel] = useState<IfcModel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"building" | "assembly" | "context">("building");
  const [pickTarget, setPickTarget] = useState<"assembly" | "part">("assembly");
  const [homeNonce, setHomeNonce] = useState(0);
  const [colorMode, setColorMode] = useState<"type" | "steel">("type");
  const [style, setStyle] = useState<"flat" | "balanced" | "metallic">("balanced");
  const [hidden, setHidden] = useState<Set<Category>>(new Set());
  const [sectionOn, setSectionOn] = useState(false);
  const [sectionPct, setSectionPct] = useState(100);
  const plane = useRef(new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e6));
  const [hover, setHover] = useState(false);
  const [hoverGeom, setHoverGeom] = useState<THREE.BufferGeometry | null>(null);
  const hoverGeomRef = useRef<THREE.BufferGeometry | null>(null);
  const lastHoverID = useRef(0);
  const lastAssemblyMark = useRef<string | undefined>(undefined);
  const setIfcData = useStore((s) => s.setIfcData);
  const selectByMark = useStore((s) => s.selectByMark);
  const select = useStore((s) => s.select);

  const onPick = async (e: any) => {
    e.stopPropagation();
    const fids = e.object?.userData?.faceIDs as number[] | undefined;
    if (!model || !fids || e.faceIndex == null) return;
    const expressID = fids[e.faceIndex];
    if (!expressID) return;
    const { partMark, assemblyMark } = await model.pick(expressID);
    if ((e.nativeEvent?.detail ?? 1) >= 2) {
      if (mode === "assembly") {
        if (partMark) select({ kind: "part", mark: partMark });
        else if (assemblyMark) select({ kind: "assembly", mark: assemblyMark });
      } else if (assemblyMark) {
        select({ kind: "assembly", mark: assemblyMark });
        setMode("assembly");
        setPickTarget("assembly");
      }
      return;
    }
    if (mode === "building" || mode === "context") {
      if (pickTarget === "part" && partMark) select({ kind: "part", mark: partMark });
      else if (assemblyMark) selectByMark(assemblyMark);
      else if (partMark) select({ kind: "part", mark: partMark });
      return;
    }
    const mark = assemblyMark || partMark;
    if (mark) selectByMark(mark);
  };

  const onHoverMove = (e: any) => {
    e.stopPropagation();
    const fids = e.object?.userData?.faceIDs as number[] | undefined;
    if (!fids || e.faceIndex == null) return;
    const id = fids[e.faceIndex];
    if (!id) return;
    setHover(true);
    if (id === lastHoverID.current) return;
    lastHoverID.current = id;
    const mesh = e.object as THREE.Mesh;
    const index = mesh.geometry.index!.array as ArrayLike<number>;
    const pos = mesh.geometry.attributes.position.array as ArrayLike<number>;
    let s = e.faceIndex;
    let en = e.faceIndex;
    while (s > 0 && fids[s - 1] === id) s--;
    while (en < fids.length - 1 && fids[en + 1] === id) en++;
    const mw = mesh.matrixWorld;
    const v = new THREE.Vector3();
    const arr: number[] = [];
    for (let t = s; t <= en; t++) {
      for (let k = 0; k < 3; k++) {
        const vi = index[t * 3 + k];
        v.set(pos[vi * 3], pos[vi * 3 + 1], pos[vi * 3 + 2]).applyMatrix4(mw);
        arr.push(v.x, v.y, v.z);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(arr, 3));
    g.computeVertexNormals();
    hoverGeomRef.current?.dispose();
    hoverGeomRef.current = g;
    setHoverGeom(g);
  };

  const onHoverOut = () => {
    setHover(false);
    lastHoverID.current = 0;
    hoverGeomRef.current?.dispose();
    hoverGeomRef.current = null;
    setHoverGeom(null);
  };

  useEffect(() => {
    let alive = true;
    setModel(null);
    setError(null);
    setLoading(true);
    loadIfcModel(path)
      .then((m) => {
        if (!alive) return;
        setModel(m);
        setIfcData(m.instanceCounts, m.assemblyParts);
        setLoading(false);
      })
      .catch((e) => {
        if (!alive) return;
        setError(String(e));
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [path, setIfcData]);

  const canIsolate = !!model && !!assemblyMark && model.assemblyMarks.has(assemblyMark);
  const isoGroup = useMemo(
    () => (model && mode === "assembly" && assemblyMark ? model.getAssemblyGroup(assemblyMark) : null),
    [model, mode, assemblyMark]
  );
  const highlightGroup = useMemo(
    () => (model && mode === "context" && assemblyMark ? model.getAssemblyHighlight(assemblyMark) : null),
    [model, mode, assemblyMark]
  );
  const body = mode === "assembly" && isoGroup ? isoGroup : model?.wholeGroup ?? null;
  const frameTarget = mode === "context" && highlightGroup ? highlightGroup : body;
  const metrics = useMemo(() => {
    const o = mode === "assembly" && isoGroup ? isoGroup : model?.wholeGroup;
    if (!o) return { footprint: 100, height: 50 };
    const s = new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3());
    return { footprint: Math.max(s.x, s.z, 1), height: Math.max(s.y, 1) };
  }, [model, mode, isoGroup]);

  useEffect(() => {
    if (!model || !assemblyMark || !canIsolate) return;
    if (lastAssemblyMark.current === assemblyMark) return;
    lastAssemblyMark.current = assemblyMark;
    setMode("assembly");
    setPickTarget("assembly");
  }, [model, assemblyMark, canIsolate]);

  useEffect(() => {
    if (!model) return;
    plane.current.constant = sectionOn ? (sectionPct / 100) * metrics.height : 1e6;
    const S = STYLES[style];
    const applyClip = (o: any) => {
      if (o.material) {
        o.material.clippingPlanes = sectionOn ? [plane.current] : [];
        o.material.clipShadows = true;
      }
    };

    if (mode === "assembly" && isoGroup) {
      isoGroup.traverse((o: any) => {
        applyClip(o);
        if (o.userData.isEdge && o.material) {
          o.material.color.set(0x0f1626);
          o.material.opacity = 0.5;
          o.material.transparent = true;
        }
        const cat = o.userData.category as Category | undefined;
        if (cat && o.isMesh) {
          const mat = o.material as THREE.MeshStandardMaterial;
          mat.color.set(colorMode === "type" ? PALETTE[cat] : STEEL);
          mat.metalness = 0.45;
          mat.roughness = 0.55;
          mat.transparent = false;
          mat.opacity = 1;
        }
        if (cat) o.visible = !hidden.has(cat);
      });
    }

    const ghost = mode === "context";
    model.wholeGroup.traverse((o: any) => {
      applyClip(o);
      if (o.userData.isEdge && o.material) {
        o.material.color.set(S.edgeColor);
        o.material.opacity = ghost ? 0.04 : S.edge;
        o.material.transparent = true;
      }
      const cat = o.userData.category as Category | undefined;
      if (cat) {
        if (o.isMesh) {
          const mat = o.material as THREE.MeshStandardMaterial;
          mat.color.set(colorMode === "type" ? PALETTE[cat] : STEEL);
          mat.metalness = S.metalness;
          mat.roughness = S.roughness;
          mat.transparent = ghost;
          mat.opacity = ghost ? 0.1 : 1;
          mat.depthWrite = !ghost;
        }
        o.visible = !hidden.has(cat);
      }
    });

    highlightGroup?.traverse((o: any) => {
      applyClip(o);
      if (o.isMesh) {
        const mat = o.material as THREE.MeshStandardMaterial;
        mat.color.set(0xc0202a);
        mat.emissive?.set?.(0x2a0405);
        mat.metalness = 0.25;
        mat.roughness = 0.5;
        mat.transparent = false;
        mat.opacity = 1;
        mat.depthWrite = true;
      }
    });
  }, [model, mode, isoGroup, highlightGroup, colorMode, style, hidden, sectionOn, sectionPct, metrics]);

  const isolating = mode === "assembly" && canIsolate;
  const inContext = mode === "context" && canIsolate;
  const hasScene = !!model && !!body;
  const toggleHide = (c: Category) =>
    setHidden((h) => {
      const n = new Set(h);
      n.has(c) ? n.delete(c) : n.add(c);
      return n;
    });

  const infoTitle = !model
    ? "Loading..."
    : isolating
    ? `${assemblyMark}${
        (model.instanceCounts.get(assemblyMark!.toLowerCase()) ?? 1) > 1
          ? ` · ${model.instanceCounts.get(assemblyMark!.toLowerCase())} instances`
          : ""
      }`
    : inContext
    ? `${assemblyMark} in building`
    : "Whole building";

  const infoSub = !model
    ? "Scanning and loading IFC"
    : isolating
    ? (model.instanceCounts.get(assemblyMark!.toLowerCase()) ?? 1) > 1
      ? "one representative piece (identical copies)"
      : "this piece with its plates"
    : inContext
    ? `${model.instanceCounts.get(assemblyMark!.toLowerCase()) ?? 1} highlighted in place`
    : `${model.elements.toLocaleString()} elements · ${basename(path)}`;

  return (
    <div className={`relative h-full w-full ${hover ? "cursor-pointer" : ""}`}>
      {hasScene ? (
        <Canvas
          key={isolating ? `asm-${assemblyMark}` : inContext ? `ctx-${assemblyMark}` : "building"}
          shadows
          dpr={[1, 2]}
          gl={{ antialias: true, localClippingEnabled: true }}
          camera={{ position: [20, 16, 20], fov: 50, near: 0.05, far: 200000 }}
        >
          <color attach="background" args={["#d8dee8"]} />
          <ambientLight intensity={0.55} />
          <hemisphereLight intensity={0.6} color="#ffffff" groundColor="#9099a8" />
          <directionalLight
            position={[metrics.footprint, metrics.height * 3, metrics.footprint]}
            intensity={1.25}
            castShadow
            shadow-mapSize={[2048, 2048]}
            shadow-bias={-0.0002}
          >
            <orthographicCamera
              attach="shadow-camera"
              args={[-metrics.footprint, metrics.footprint, metrics.footprint, -metrics.footprint, 0.1, metrics.height * 8]}
            />
          </directionalLight>
          <directionalLight position={[-metrics.footprint, metrics.height * 2, -metrics.footprint]} intensity={0.4} />
          <Environment resolution={256} frames={1}>
            <Lightformer intensity={1.6} position={[0, 8, 0]} scale={[12, 12, 1]} />
            <Lightformer intensity={1.0} position={[8, 4, 8]} scale={[6, 6, 1]} />
            <Lightformer intensity={0.8} position={[-8, 4, -6]} scale={[6, 6, 1]} />
          </Environment>
          <primitive object={body} onClick={onPick} onPointerMove={onHoverMove} onPointerOut={onHoverOut} />
          {inContext && highlightGroup && <primitive object={highlightGroup} onClick={onPick} />}
          {hoverGeom && (
            <mesh
              geometry={hoverGeom}
              renderOrder={999}
              onUpdate={(self) => {
                self.raycast = () => null as any;
              }}
            >
              <meshBasicMaterial color="#ffd24a" transparent opacity={0.25} depthTest={false} depthWrite={false} />
            </mesh>
          )}
          <FrameObject object={frameTarget!} nonce={homeNonce} />
          <ContactShadows
            position={[0, 0, 0]}
            scale={metrics.footprint * 2.2}
            far={metrics.height * 1.2}
            opacity={0.5}
            blur={2.5}
            resolution={1024}
          />
          <Grid
            args={[10, 10]}
            cellSize={1000}
            cellThickness={0.6}
            cellColor="#c2cad6"
            sectionSize={10000}
            sectionThickness={1}
            sectionColor="#9aa7bd"
            infiniteGrid
            fadeDistance={metrics.footprint * 4}
            fadeStrength={2}
          />
          <OrbitControls makeDefault enableDamping dampingFactor={0.08} rotateSpeed={0.8} zoomSpeed={0.8} panSpeed={0.8} />
          <PanGesture />
          <FirstHitOnly />
          <GizmoHelper alignment="bottom-right" margin={[70, 70]}>
            <GizmoViewcube color="#1f2d49" textColor="#fff" strokeColor="#2c3a5a" />
          </GizmoHelper>
          {isolating && (
            <EffectComposer multisampling={4} enableNormalPass>
              <N8AO
                halfRes
                aoRadius={Math.min(Math.max(metrics.footprint * 0.02, 0.2), 3)}
                intensity={3}
                distanceFalloff={1}
                color="#0a0f1a"
              />
              <SMAA />
            </EffectComposer>
          )}
        </Canvas>
      ) : (
        <div className="flex h-full items-center justify-center bg-[#0f172a]">
          <div className="rounded-xl border border-fnc-border bg-fnc-panel/95 px-5 py-4 text-center shadow-2xl">
            <div className="mb-2 text-sm font-semibold text-white">
              {loading ? "Loading building model" : "Preparing viewer"}
            </div>
            <div className="text-xs text-fnc-steel">Large IFC files can take a while on first open.</div>
          </div>
        </div>
      )}

      {loading && (
        <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-fnc-bg/40 backdrop-blur-sm">
          <div className="rounded-xl border border-fnc-border bg-fnc-panel/95 px-5 py-4 text-center shadow-2xl">
            <div className="mb-2 text-sm font-semibold text-white">Loading building model</div>
            <div className="text-xs text-fnc-steel">Large IFC files can take a while on first open.</div>
          </div>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-fnc-bg/70 backdrop-blur-sm">
          <div className="max-w-md rounded-xl border border-fnc-border bg-fnc-panel/95 px-5 py-4 text-center shadow-2xl">
            <div className="mb-2 text-sm font-semibold text-white">Failed to load IFC</div>
            <div className="text-xs text-fnc-steel">{error}</div>
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute left-3 top-3 rounded-lg bg-fnc-panel/90 px-3 py-2 text-xs backdrop-blur">
        <div className="font-semibold text-white">{infoTitle}</div>
        <div className="text-fnc-steel">{infoSub}</div>
      </div>

      <div className="absolute left-3 top-16 w-44 rounded-lg bg-fnc-panel/90 p-2 text-xs backdrop-blur">
        {!isolating && model && (
          <div className="mb-1">
            <div className="mb-1 text-[10px] uppercase tracking-wide text-fnc-steel/70">Style</div>
            <div className="flex gap-1">
              <MiniToggle active={style === "flat"} onClick={() => setStyle("flat")}>Flat</MiniToggle>
              <MiniToggle active={style === "balanced"} onClick={() => setStyle("balanced")}>Mid</MiniToggle>
              <MiniToggle active={style === "metallic"} onClick={() => setStyle("metallic")}>Metal</MiniToggle>
            </div>
          </div>
        )}
        {model && (
          <>
            <div className="mb-1 flex gap-1">
              <MiniToggle active={colorMode === "type"} onClick={() => setColorMode("type")}>By type</MiniToggle>
              <MiniToggle active={colorMode === "steel"} onClick={() => setColorMode("steel")}>Steel</MiniToggle>
            </div>
            <div className="mb-1">
              <div className="mb-1 text-[10px] uppercase tracking-wide text-fnc-steel/70">Pick</div>
              <div className="flex gap-1">
                <MiniToggle active={pickTarget === "assembly"} onClick={() => setPickTarget("assembly")}>
                  Assemblies
                </MiniToggle>
                <MiniToggle active={pickTarget === "part"} onClick={() => setPickTarget("part")}>
                  Parts
                </MiniToggle>
              </div>
            </div>
          </>
        )}
        {model?.categories.map((c) => (
          <button
            key={c}
            onClick={() => toggleHide(c)}
            className={`flex w-full items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-fnc-panel-2 ${
              hidden.has(c) ? "opacity-40" : ""
            }`}
            title={hidden.has(c) ? "Show" : "Hide"}
          >
            <span className="inline-block h-3 w-3 rounded-sm" style={{ background: colorMode === "type" ? hex(PALETTE[c]) : hex(STEEL) }} />
            <span className="text-fnc-steel">{c}</span>
            <span className="ml-auto text-fnc-steel/60">{hidden.has(c) ? "🚫" : "👁"}</span>
          </button>
        ))}
        {model && (
          <div className="mt-2 border-t border-fnc-border pt-2">
            <label className="flex items-center gap-2 text-fnc-steel">
              <input type="checkbox" checked={sectionOn} onChange={(e) => setSectionOn(e.target.checked)} />
              Section cut
            </label>
            {sectionOn && (
              <input
                type="range"
                min={0}
                max={100}
                value={sectionPct}
                onChange={(e) => setSectionPct(Number(e.target.value))}
                className="mt-1 w-full"
              />
            )}
          </div>
        )}
      </div>

      {assemblyMark && model && (
        <div className="absolute right-3 top-3 flex gap-1">
          <Toggle active={mode === "building"} onClick={() => setMode("building")}>Whole building</Toggle>
          <Toggle active={mode === "assembly"} disabled={!canIsolate} onClick={() => setMode("assembly")}>
            {canIsolate ? `Isolate ${assemblyMark}` : "Not in model"}
          </Toggle>
          <Toggle active={mode === "context"} disabled={!canIsolate} onClick={() => setMode("context")}>
            In building
          </Toggle>
        </div>
      )}

      <button
        onClick={() => setHomeNonce((n) => n + 1)}
        className="absolute bottom-3 left-3 rounded-md border border-fnc-border bg-fnc-panel/90 px-3 py-1.5 text-xs font-medium text-fnc-steel backdrop-blur transition hover:text-white"
        title="Reset to home view"
      >
        ⌂ Home
      </button>
    </div>
  );
}

function Toggle({ active, disabled, onClick, children }: { active: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md border border-fnc-border px-3 py-1.5 text-xs font-medium backdrop-blur transition disabled:opacity-40 ${
        active ? "bg-fnc-red text-white" : "bg-fnc-panel/90 text-fnc-steel hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

function MiniToggle({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded px-2 py-1 font-medium transition ${
        active ? "bg-fnc-red text-white" : "bg-fnc-panel-2 text-fnc-steel hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}
