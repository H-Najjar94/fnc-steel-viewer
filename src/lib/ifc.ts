import * as THREE from "three";
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from "three-mesh-bvh";
import {
  IfcAPI,
  IFCRELAGGREGATES,
  IFCMECHANICALFASTENER,
  IFCBEAM,
  IFCPLATE,
  IFCCOLUMN,
  IFCMEMBER,
} from "web-ifc";
import { readFileBytes } from "./api";

// Fast raycasting (BVH) so hover/click on the merged building is smooth.
(THREE.BufferGeometry.prototype as any).computeBoundsTree = computeBoundsTree;
(THREE.BufferGeometry.prototype as any).disposeBoundsTree = disposeBoundsTree;
(THREE.Mesh.prototype as any).raycast = acceleratedRaycast;

export type Category = "Column" | "Beam" | "Plate" | "Member" | "Other";
export const CATEGORY_ORDER: Category[] = ["Column", "Beam", "Plate", "Member", "Other"];

export interface AssemblyPart {
  name: string; // e.g. "STAYPLATE", "RAFTER"
  profile: string; // e.g. "PL5*70", "IPE450"
  category: Category;
}

export interface AssemblyPartMarked extends AssemblyPart {
  mark: string; // the part position/mark (e.g. "PL323") read from the IFC Reference
}

export interface IfcModel {
  wholeGroup: THREE.Group;
  elements: number;
  categories: Category[];
  assemblyMarks: Set<string>;
  /** mark -> how many identical assemblies carry that mark in the building. */
  instanceCounts: Map<string, number>;
  /** mark (lowercase) -> parts of one representative assembly (from the IFC). */
  assemblyParts: Map<string, AssemblyPart[]>;
  /** One representative assembly, centered (for inspection). */
  getAssemblyGroup: (mark: string) => THREE.Group | null;
  /** ALL instances of a mark, aligned over the whole building (for locate-in-context). */
  getAssemblyHighlight: (mark: string) => THREE.Group | null;
  /** Parts of one representative assembly WITH their CNC marks (read on demand). */
  getAssemblyPartMarks: (mark: string) => Promise<AssemblyPartMarked[]>;
  /** Resolve a clicked element's part mark + parent assembly mark. */
  pick: (expressID: number) => Promise<{ partMark: string; assemblyMark: string }>;
}

interface Bucket {
  pos: number[];
  norm: number[];
  idx: number[];
  faceIDs: number[]; // expressID per triangle, for picking
  category: Category;
}

const cache = new Map<string, Promise<IfcModel>>();

export function loadIfcModel(path: string): Promise<IfcModel> {
  let p = cache.get(path);
  if (!p) {
    p = build(path);
    cache.set(path, p);
  }
  return p;
}

const cleanMark = (s: string) => String(s).replace(/\(\?\)\s*$/, "").trim();

// Read part/assembly marks from an element's property sets. Covers both Tekla
// export styles: newer ("Reference") and older 19.0 ("Part mark"/"Assembly mark").
async function readMarks(
  api: IfcAPI,
  modelID: number,
  id: number
): Promise<{ partMark: string; assemblyMark: string }> {
  try {
    const psets = await (api as any).properties.getPropertySets(modelID, id, true);
    let partMark = "";
    let assemblyMark = "";
    for (const ps of psets ?? []) {
      for (const p of ps?.HasProperties ?? []) {
        const nm = p?.Name?.value;
        const val = p?.NominalValue?.value;
        if (val == null || val === "") continue;
        if (nm === "Part mark") partMark = cleanMark(val);
        else if (nm === "Assembly mark" || nm === "Assembly/Cast unit Mark")
          assemblyMark = cleanMark(val);
        else if (nm === "Reference" && !partMark) partMark = cleanMark(val);
      }
    }
    return { partMark, assemblyMark };
  } catch {
    return { partMark: "", assemblyMark: "" };
  }
}

function categoryOf(code: number): Category {
  switch (code) {
    case IFCCOLUMN:
      return "Column";
    case IFCBEAM:
      return "Beam";
    case IFCPLATE:
      return "Plate";
    case IFCMEMBER:
      return "Member";
    default:
      return "Other";
  }
}

function addPlaced(
  api: IfcAPI,
  modelID: number,
  geometries: any,
  category: Category,
  expressID: number,
  buckets: Map<Category, Bucket>,
  m: THREE.Matrix4,
  nm: THREE.Matrix3,
  vp: THREE.Vector3,
  vn: THREE.Vector3
) {
  let b = buckets.get(category);
  if (!b) {
    b = { pos: [], norm: [], idx: [], faceIDs: [], category };
    buckets.set(category, b);
  }
  for (let i = 0; i < geometries.size(); i++) {
    const pg = geometries.get(i);
    const geom = api.GetGeometry(modelID, pg.geometryExpressID);
    const verts = api.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize()) as Float32Array;
    const indices = api.GetIndexArray(geom.GetIndexData(), geom.GetIndexDataSize()) as Uint32Array;
    m.fromArray(pg.flatTransformation as number[]);
    nm.getNormalMatrix(m);
    const base = b.pos.length / 3;
    const n = verts.length / 6;
    for (let v = 0; v < n; v++) {
      vp.set(verts[v * 6], verts[v * 6 + 1], verts[v * 6 + 2]).applyMatrix4(m);
      vn.set(verts[v * 6 + 3], verts[v * 6 + 4], verts[v * 6 + 5]).applyMatrix3(nm).normalize();
      b.pos.push(vp.x, vp.y, vp.z);
      b.norm.push(vn.x, vn.y, vn.z);
    }
    for (let k = 0; k < indices.length; k++) b.idx.push(base + indices[k]);
    const tris = indices.length / 3;
    for (let t = 0; t < tris; t++) b.faceIDs.push(expressID);
    geom.delete();
  }
}

function bucketsToGroup(buckets: Map<Category, Bucket>, withEdges = false): THREE.Group {
  const group = new THREE.Group();
  for (const b of buckets.values()) {
    if (!b.idx.length) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(b.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(b.norm, 3));
    g.setIndex(b.idx);
    // indirect: true keeps the index buffer in its original order, so the
    // raycaster's faceIndex still maps to our triangle->element table (faceIDs).
    (g as any).computeBoundsTree?.({ indirect: true });
    const mat = new THREE.MeshStandardMaterial({
      color: 0x9aa7bd,
      metalness: 0.45,
      roughness: 0.55,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(g, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.category = b.category;
    mesh.userData.faceIDs = b.faceIDs; // triangle -> expressID, for picking
    group.add(mesh);
    if (withEdges) {
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(g, 30),
        new THREE.LineBasicMaterial({ color: 0x0f1626, transparent: true, opacity: 0.5 })
      );
      edges.userData.isEdge = true;
      edges.userData.category = b.category;
      // Keep outline geometry visual-only so it never steals hover/click hits.
      edges.raycast = () => null as any;
      group.add(edges);
    }
  }
  return group;
}

function computeUpRotation(group: THREE.Group): THREE.Euler {
  group.updateMatrixWorld(true);
  const size = new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3());
  const e = new THREE.Euler();
  if (size.z <= size.x && size.z <= size.y) e.x = -Math.PI / 2;
  else if (size.x <= size.y && size.x <= size.z) e.z = Math.PI / 2;
  return e;
}

function orient(group: THREE.Group, rot: THREE.Euler): THREE.Group {
  group.rotation.copy(rot);
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  if (!box.isEmpty()) {
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    group.position.set(-center.x, -center.y + size.y / 2, -center.z);
  }
  return group;
}

async function build(path: string): Promise<IfcModel> {
  const api = new IfcAPI();
  api.SetWasmPath("/", true);
  await api.Init();
  const bytes = await readFileBytes(path);
  const modelID = api.OpenModel(new Uint8Array(bytes));

  const m = new THREE.Matrix4();
  const nm = new THREE.Matrix3();
  const vp = new THREE.Vector3();
  const vn = new THREE.Vector3();

  const buckets = new Map<Category, Bucket>();
  let elements = 0;
  api.StreamAllMeshes(modelID, (mesh: any) => {
    const code = api.GetLineType(modelID, mesh.expressID);
    if (code === IFCMECHANICALFASTENER) return; // skip bolts
    elements++;
    addPlaced(api, modelID, mesh.geometries, categoryOf(code), mesh.expressID, buckets, m, nm, vp, vn);
  });
  const wholeGroup = bucketsToGroup(buckets, true); // edges kept but drawn faint at building scale
  const upRotation = computeUpRotation(wholeGroup);
  orient(wholeGroup, upRotation);

  // Index each assembly INSTANCE separately (so we can show just one identical
  // copy), keyed by its IfcElementAssembly express id; plus mark -> instances.
  const asmParts = new Map<number, number[]>();
  const markAsms = new Map<string, number[]>();
  const markCache = new Map<number, string>();
  const aggIDs = api.GetLineIDsWithType(modelID, IFCRELAGGREGATES);
  for (let i = 0; i < aggIDs.size(); i++) {
    const rel = api.GetLine(modelID, aggIDs.get(i));
    const relating = rel?.RelatingObject?.value;
    if (relating == null) continue;
    const relatedIds: number[] = [];
    for (const r of rel.RelatedObjects ?? []) if (r?.value != null) relatedIds.push(r.value);
    if (!relatedIds.length) continue;
    let mark = markCache.get(relating);
    if (mark === undefined) {
      let mk = "";
      try {
        const a = api.GetLine(modelID, relating);
        mk = a?.Tag?.value ? cleanMark(a.Tag.value) : "";
      } catch {
        mk = "";
      }
      // Older Tekla exports leave the assembly Tag empty; the mark lives on the
      // parts as an "Assembly mark" property.
      if (!mk) mk = (await readMarks(api, modelID, relatedIds[0])).assemblyMark;
      mark = mk;
      markCache.set(relating, mark);
    }
    if (!mark) continue;
    const parts = asmParts.get(relating) ?? [];
    parts.push(...relatedIds);
    asmParts.set(relating, parts);
    const list = markAsms.get(mark) ?? [];
    if (!list.includes(relating)) list.push(relating);
    markAsms.set(mark, list);
  }

  // Build only the FIRST instance of a mark — one representative piece.
  const getAssemblyGroup = (mark: string): THREE.Group | null => {
    const instances = markAsms.get(mark);
    if (!instances?.length) return null;
    const ids = asmParts.get(instances[0]) ?? [];
    if (!ids.length) return null;
    const b = new Map<Category, Bucket>();
    for (const id of ids) {
      try {
        const cat = categoryOf(api.GetLineType(modelID, id));
        const fm = api.GetFlatMesh(modelID, id);
        addPlaced(api, modelID, fm.geometries, cat, id, b, m, nm, vp, vn);
      } catch {
        /* skip */
      }
    }
    return orient(bucketsToGroup(b, true), upRotation);
  };

  // ALL instances of a mark, kept in their real positions and aligned to the
  // whole-building group (same rotation + recenter offset) so they overlay it.
  const getAssemblyHighlight = (mark: string): THREE.Group | null => {
    const instances = markAsms.get(mark);
    if (!instances?.length) return null;
    const b = new Map<Category, Bucket>();
    for (const asmId of instances) {
      for (const id of asmParts.get(asmId) ?? []) {
        try {
          const cat = categoryOf(api.GetLineType(modelID, id));
          const fm = api.GetFlatMesh(modelID, id);
          addPlaced(api, modelID, fm.geometries, cat, id, b, m, nm, vp, vn);
        } catch {
          /* skip */
        }
      }
    }
    const g = bucketsToGroup(b, false);
    g.rotation.copy(wholeGroup.rotation);
    g.position.copy(wholeGroup.position);
    g.traverse((o: any) => {
      if (o.isMesh) o.userData.highlight = true;
    });
    return g;
  };

  // Read each part's CNC mark (Tekla "Reference" property) on demand, per assembly.
  const markAsmsLc = new Map<string, number[]>();
  for (const [k, v] of markAsms) markAsmsLc.set(k.toLowerCase(), v);
  const partMarkCache = new Map<string, AssemblyPartMarked[]>();
  const getAssemblyPartMarks = async (mark: string): Promise<AssemblyPartMarked[]> => {
    const key = mark.toLowerCase();
    const cached = partMarkCache.get(key);
    if (cached) return cached;
    const instances = markAsmsLc.get(key);
    if (!instances?.length) {
      partMarkCache.set(key, []);
      return [];
    }
    const ids = asmParts.get(instances[0]) ?? [];
    const out: AssemblyPartMarked[] = [];
    for (const id of ids) {
      let name = "";
      let profile = "";
      let mk = "";
      let category: Category = "Other";
      try {
        const ln = api.GetLine(modelID, id);
        name = ln?.Name?.value ?? "";
        profile = ln?.ObjectType?.value ?? "";
        category = categoryOf(api.GetLineType(modelID, id));
        const tag = ln?.Tag?.value ?? "";
        if (tag && !/^ID[0-9a-f-]/i.test(tag)) mk = cleanMark(tag); // some parts carry the mark in Tag
      } catch {
        /* skip */
      }
      if (!mk) mk = (await readMarks(api, modelID, id)).partMark;
      out.push({ name, profile, category, mark: mk });
    }
    partMarkCache.set(key, out);
    return out;
  };

  // Reverse map: part expressID -> its assembly mark (for click-to-locate).
  const partToAssembly = new Map<number, string>();
  for (const [asmId, partIds] of asmParts) {
    const mk = markCache.get(asmId) ?? "";
    for (const pid of partIds) if (!partToAssembly.has(pid)) partToAssembly.set(pid, mk);
  }

  const pick = async (expressID: number): Promise<{ partMark: string; assemblyMark: string }> => {
    let partMark = "";
    try {
      const ln = api.GetLine(modelID, expressID);
      const tag = ln?.Tag?.value ?? "";
      if (tag && !/^ID[0-9a-f-]/i.test(tag)) partMark = cleanMark(tag);
    } catch {
      /* skip */
    }
    if (!partMark) partMark = (await readMarks(api, modelID, expressID)).partMark;
    return { partMark, assemblyMark: partToAssembly.get(expressID) ?? "" };
  };

  const present = new Set<Category>();
  for (const b of buckets.values()) present.add(b.category);
  const categories = CATEGORY_ORDER.filter((c) => present.has(c));

  // Count identical assemblies per mark (works for both export styles).
  const instanceCounts = new Map<string, number>();
  for (const [mark, list] of markAsms) instanceCounts.set(mark.toLowerCase(), list.length);

  // Parts of one representative assembly per mark (name + profile + category).
  const assemblyParts = new Map<string, AssemblyPart[]>();
  for (const [mark, instances] of markAsms) {
    const ids = asmParts.get(instances[0]) ?? [];
    const list: AssemblyPart[] = [];
    for (const id of ids) {
      try {
        const ln = api.GetLine(modelID, id);
        list.push({
          name: ln?.Name?.value ?? "",
          profile: ln?.ObjectType?.value ?? "",
          category: categoryOf(api.GetLineType(modelID, id)),
        });
      } catch {
        /* skip */
      }
    }
    assemblyParts.set(mark.toLowerCase(), list);
  }

  return {
    wholeGroup,
    elements,
    categories,
    assemblyMarks: new Set(markAsms.keys()),
    instanceCounts,
    assemblyParts,
    getAssemblyGroup,
    getAssemblyHighlight,
    getAssemblyPartMarks,
    pick,
  };
}
