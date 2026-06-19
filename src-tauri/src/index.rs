//! Project scanning + relational index for an FNC steel project folder.

use crate::dstv;
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Part {
    pub mark: String,
    pub name: String,
    pub category: String, // "Plate" | "Profile"
    pub profile: String,
    pub profile_type: String,
    pub material: String,
    pub length_mm: f64,
    pub width_mm: f64,
    pub height_mm: f64,
    pub flange_t_mm: f64,
    pub web_t_mm: f64,
    pub radius_mm: f64,
    pub weight_per_m: f64,
    pub weight_kg: f64,
    pub quantity: u32,
    pub thickness_group: Option<String>, // "PL10"
    pub parent_assembly: String,
    pub nc1_path: Option<String>,
    pub dxf_path: Option<String>,
    pub pdf_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DrawingRef {
    pub kind: String, // "Assembly" | "Single Part" | "Revision" | "Erection" | "Drawing"
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Assembly {
    pub mark: String,
    pub name: String,
    pub dwg_path: Option<String>,
    pub pdf_path: Option<String>,
    pub drawings: Vec<DrawingRef>, // all PDF drawings for this mark
    pub part_marks: Vec<String>,
}

fn drawing_kind(lower_path: &str) -> &'static str {
    if lower_path.contains("تعديل") || lower_path.contains("revision") {
        "Revision"
    } else if lower_path.contains("single") {
        "Single Part"
    } else if lower_path.contains("erection") {
        "Erection"
    } else if lower_path.contains("assembly") {
        "Assembly"
    } else {
        "Drawing"
    }
}

fn drawing_rank(kind: &str) -> u8 {
    match kind {
        "Revision" => 0,
        "Assembly" => 1,
        "Single Part" => 2,
        "Erection" => 3,
        _ => 4,
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Report {
    pub name: String,
    pub path: String,
    pub ext: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Stats {
    pub assemblies: usize,
    pub parts: usize,
    pub part_instances: u64, // sum of quantities
    pub total_weight_kg: f64,
    pub pdfs: usize,
    pub dwgs: usize,
    pub nc1: usize,
    pub dxf: usize,
    pub by_category: HashMap<String, usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectIndex {
    pub root: String,
    pub name: String,
    pub logo_path: Option<String>,
    pub ifc_path: Option<String>,
    pub assemblies: Vec<Assembly>,
    pub parts: Vec<Part>,
    pub reports: Vec<Report>,
    pub stats: Stats,
}

fn norm(p: &Path) -> String {
    p.to_string_lossy().replace('\\', "/")
}

fn stem_lower(p: &Path) -> String {
    p.file_stem()
        .map(|s| s.to_string_lossy().to_lowercase())
        .unwrap_or_default()
}

#[derive(Default)]
struct DxfPlateInfo {
    thickness: Option<f64>,
    thickness_group: Option<String>,
    material: Option<String>,
    length_mm: f64, // longer bbox side
    width_mm: f64,  // shorter bbox side
    weight_kg: f64,
    holes: u32,
}

fn poly_area(pts: &[(f64, f64)]) -> f64 {
    let mut a = 0.0;
    for i in 0..pts.len() {
        let j = (i + 1) % pts.len();
        a += pts[i].0 * pts[j].1 - pts[j].0 * pts[i].1;
    }
    a.abs() / 2.0
}

fn point_in_poly(pt: (f64, f64), poly: &[(f64, f64)]) -> bool {
    let mut inside = false;
    let mut j = poly.len() - 1;
    for i in 0..poly.len() {
        let (xi, yi) = poly[i];
        let (xj, yj) = poly[j];
        if (yi > pt.1) != (yj > pt.1) && pt.0 < (xj - xi) * (pt.1 - yi) / (yj - yi) + xi {
            inside = !inside;
        }
        j = i;
    }
    inside
}

/// Parse a Tekla-style per-part DXF cut file for full plate specs: thickness +
/// material (from a TEXT like "28+PL8+S235JR"), bounding-box length/width, hole
/// count, and weight (net plate area x thickness x steel density). Mirrors the
/// detail you'd get from a DSTV .nc1, computed from the cut geometry.
fn dxf_plate_info(path: &Path) -> DxfPlateInfo {
    let mut out = DxfPlateInfo::default();
    let txt = match std::fs::read_to_string(path) {
        Ok(t) => t,
        Err(_) => return out,
    };

    // --- thickness + material from annotation text ---
    for tok in txt.split(|c: char| !(c.is_ascii_alphanumeric() || c == '.')) {
        if tok.len() < 2 {
            continue;
        }
        let up = tok.to_uppercase();
        if let Some(rest) = up.strip_prefix("PL") {
            if out.thickness.is_none() && !rest.is_empty() {
                if let Ok(v) = rest.parse::<f64>() {
                    out.thickness = Some(v);
                    out.thickness_group = Some(format!("PL{}", rest.trim_end_matches(".0")));
                }
            }
        } else if out.material.is_none()
            && up.starts_with('S')
            && up.len() >= 4
            && up.as_bytes()[1].is_ascii_digit()
            && up.as_bytes()[2].is_ascii_digit()
            && up.as_bytes()[3].is_ascii_digit()
        {
            out.material = Some(up);
        }
    }

    // --- geometry: walk DXF group-code/value pairs ---
    struct Loop {
        layer: String,
        pts: Vec<(f64, f64)>,
    }
    let mut loops: Vec<Loop> = Vec::new();
    let mut circles: Vec<(f64, f64, f64)> = Vec::new();

    let mut cur = String::new();
    let mut layer = String::new();
    let mut xs: Vec<f64> = Vec::new();
    let mut ys: Vec<f64> = Vec::new();
    let mut radius: Option<f64> = None;
    let mut in_poly = false;
    let mut poly_layer = String::new();
    let mut poly_pts: Vec<(f64, f64)> = Vec::new();

    let lines: Vec<&str> = txt.lines().collect();
    let mut i = 0;
    while i + 1 < lines.len() {
        let code: i32 = lines[i].trim().parse().unwrap_or(i32::MIN);
        let val = lines[i + 1].trim();
        i += 2;
        match code {
            0 => {
                // finalize the entity that just ended
                match cur.as_str() {
                    "LWPOLYLINE" => {
                        if xs.len() >= 3 {
                            let pts = xs.iter().cloned().zip(ys.iter().cloned()).collect();
                            loops.push(Loop { layer: layer.clone(), pts });
                        }
                    }
                    "POLYLINE" => {
                        in_poly = true;
                        poly_layer = layer.clone();
                        poly_pts.clear();
                    }
                    "VERTEX" => {
                        if in_poly && !xs.is_empty() && !ys.is_empty() {
                            poly_pts.push((xs[0], ys[0]));
                        }
                    }
                    "SEQEND" => {
                        if in_poly {
                            if poly_pts.len() >= 3 {
                                loops.push(Loop {
                                    layer: poly_layer.clone(),
                                    pts: std::mem::take(&mut poly_pts),
                                });
                            }
                            in_poly = false;
                        }
                    }
                    "CIRCLE" => {
                        if let Some(r) = radius {
                            if r > 0.01 && !xs.is_empty() && !ys.is_empty() {
                                circles.push((xs[0], ys[0], r));
                            }
                        }
                    }
                    _ => {}
                }
                cur = val.to_string();
                xs.clear();
                ys.clear();
                radius = None;
                layer.clear();
            }
            8 => layer = val.to_string(),
            10 => {
                if let Ok(v) = val.parse() {
                    xs.push(v);
                }
            }
            20 => {
                if let Ok(v) = val.parse() {
                    ys.push(v);
                }
            }
            40 => radius = val.parse().ok(),
            _ => {}
        }
    }

    // outer contour = largest closed loop, preferring layer CUT
    let closed: Vec<&Loop> = loops.iter().filter(|l| l.pts.len() >= 3).collect();
    if closed.is_empty() {
        return out;
    }
    let cut: Vec<&&Loop> = closed.iter().filter(|l| l.layer.eq_ignore_ascii_case("CUT")).collect();
    let pool: Vec<&Loop> = if cut.is_empty() {
        closed.clone()
    } else {
        cut.iter().map(|l| **l).collect()
    };
    let outer = pool
        .iter()
        .max_by(|a, b| poly_area(&a.pts).partial_cmp(&poly_area(&b.pts)).unwrap())
        .unwrap();

    // bbox -> length / width
    let (mut minx, mut miny, mut maxx, mut maxy) = (f64::MAX, f64::MAX, f64::MIN, f64::MIN);
    for &(x, y) in &outer.pts {
        minx = minx.min(x);
        miny = miny.min(y);
        maxx = maxx.max(x);
        maxy = maxy.max(y);
    }
    let w = maxx - minx;
    let h = maxy - miny;
    out.length_mm = w.max(h);
    out.width_mm = w.min(h);

    // net area = outer minus holes (circles + inner CUT loops inside the outer)
    let mut net = poly_area(&outer.pts);
    for &(cx, cy, r) in &circles {
        if point_in_poly((cx, cy), &outer.pts) {
            net -= std::f64::consts::PI * r * r;
            out.holes += 1;
        }
    }
    let outer_area = poly_area(&outer.pts);
    for l in &closed {
        if std::ptr::eq(*l, *outer) {
            continue;
        }
        // Holes live on cut/hole layers (e.g. "CUT", "30"); skip annotations.
        let up = l.layer.to_uppercase();
        if up == "SCRIBE" || up == "TEXT" || up == "LAYOUT" {
            continue;
        }
        let a = poly_area(&l.pts);
        if a < outer_area * 0.98 {
            let cx = l.pts.iter().map(|p| p.0).sum::<f64>() / l.pts.len() as f64;
            let cy = l.pts.iter().map(|p| p.1).sum::<f64>() / l.pts.len() as f64;
            if point_in_poly((cx, cy), &outer.pts) {
                net -= a;
                out.holes += 1;
            }
        }
    }
    if let Some(t) = out.thickness {
        // steel density 7850 kg/m^3 = 7.85e-6 kg/mm^3
        out.weight_kg = (net.max(0.0)) * t * 7.85e-6;
    }
    out
}

/// Mark used to match a single-part file: leading token before " - " or whitespace.
fn mark_from_filename(stem: &str) -> String {
    let s = stem.trim();
    if let Some(idx) = s.find(" - ") {
        s[..idx].trim().to_string()
    } else {
        // e.g. "1131" or "IF106"
        s.split_whitespace().next().unwrap_or(s).trim().to_string()
    }
}

/// Build the full project index by walking the folder.
/// `excludes` are path prefixes to skip (e.g. a nested second project), so
/// projects stored inside one another stay isolated.
pub fn scan(root: &str, excludes: &[String]) -> Result<ProjectIndex, String> {
    let root_path = PathBuf::from(root);
    if !root_path.is_dir() {
        return Err(format!("Not a directory: {root}"));
    }
    let ex: Vec<String> = excludes
        .iter()
        .map(|e| e.replace('\\', "/").to_lowercase())
        .filter(|e| !e.is_empty())
        .collect();

    let mut nc1_files: Vec<PathBuf> = Vec::new();
    let mut dxf_files: Vec<PathBuf> = Vec::new();
    let mut pdf_files: Vec<PathBuf> = Vec::new();
    let mut dwg_files: Vec<PathBuf> = Vec::new();
    let mut reports: Vec<Report> = Vec::new();
    let mut logo_path: Option<String> = None;
    let mut ifc_path: Option<String> = None;

    let walker = WalkDir::new(&root_path).into_iter().filter_entry(|e| {
        if ex.is_empty() {
            return true;
        }
        let p = e.path().to_string_lossy().replace('\\', "/").to_lowercase();
        !ex.iter().any(|x| p.starts_with(x))
    });
    for entry in walker.filter_map(|e| e.ok()) {
        if !entry.file_type().is_file() {
            continue;
        }
        let p = entry.path().to_path_buf();
        let ext = p
            .extension()
            .map(|e| e.to_string_lossy().to_lowercase())
            .unwrap_or_default();
        match ext.as_str() {
            "nc1" => nc1_files.push(p),
            "dxf" => dxf_files.push(p),
            "pdf" => pdf_files.push(p),
            "dwg" => dwg_files.push(p),
            "xlsx" | "xlsb" | "xls" => reports.push(Report {
                name: p
                    .file_name()
                    .map(|s| s.to_string_lossy().to_string())
                    .unwrap_or_default(),
                path: norm(&p),
                ext: ext.clone(),
            }),
            "ifc" => {
                if ifc_path.is_none() {
                    ifc_path = Some(norm(&p));
                }
            }
            "png" | "jpg" | "jpeg" | "svg" => {
                let name = stem_lower(&p);
                if logo_path.is_none() && name.contains("logo") {
                    logo_path = Some(norm(&p));
                }
            }
            _ => {}
        }
    }

    // Lookup maps for fast file linking (by lowercased mark / stem).
    let dxf_by_mark: HashMap<String, String> = dxf_files
        .iter()
        .map(|p| (mark_from_filename(&stem_lower(p)), norm(p)))
        .collect();

    // PDFs keyed by mark. Folder names vary across projects ("ASSEMBLY/PDF" vs
    // "1-Assembly Drawings"), so classify by the word "assembly"/"single" anywhere
    // in the path, and keep an any-PDF fallback so every mark can find its drawing.
    let mut single_pdf_by_mark: HashMap<String, String> = HashMap::new();
    let mut assembly_pdf_by_mark: HashMap<String, String> = HashMap::new();
    let mut any_pdf_by_mark: HashMap<String, String> = HashMap::new();
    let mut drawings_by_mark: HashMap<String, Vec<DrawingRef>> = HashMap::new();
    for p in &pdf_files {
        let np = norm(p);
        let lower = np.to_lowercase();
        let mark = mark_from_filename(&stem_lower(p));
        any_pdf_by_mark.entry(mark.clone()).or_insert(np.clone());
        let kind = drawing_kind(&lower);
        drawings_by_mark.entry(mark.clone()).or_default().push(DrawingRef {
            kind: kind.to_string(),
            path: np.clone(),
        });
        if lower.contains("single") {
            single_pdf_by_mark.entry(mark).or_insert(np);
        } else if lower.contains("assembly") {
            assembly_pdf_by_mark.entry(mark).or_insert(np);
        }
    }
    // Sort each mark's drawings by kind priority (Revision, Assembly, Single, ...).
    for list in drawings_by_mark.values_mut() {
        list.sort_by_key(|d| drawing_rank(&d.kind));
    }

    // Assembly DWGs.
    let mut assemblies: Vec<Assembly> = Vec::new();
    let mut assembly_idx: HashMap<String, usize> = HashMap::new();
    for p in &dwg_files {
        let stem = p
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_default();
        let mark = mark_from_filename(&stem);
        let name = stem
            .find(" - ")
            .map(|i| stem[i + 3..].trim().to_string())
            .unwrap_or_default();
        let pdf = assembly_pdf_by_mark
            .get(&mark.to_lowercase())
            .or_else(|| any_pdf_by_mark.get(&mark.to_lowercase()))
            .cloned();
        let drawings = drawings_by_mark.get(&mark.to_lowercase()).cloned().unwrap_or_default();
        assembly_idx.insert(mark.to_lowercase(), assemblies.len());
        assemblies.push(Assembly {
            mark,
            name,
            dwg_path: Some(norm(p)),
            pdf_path: pdf,
            drawings,
            part_marks: Vec::new(),
        });
    }

    // Parse all .nc1 in parallel.
    let mut parts: Vec<Part> = nc1_files
        .par_iter()
        .filter_map(|p| {
            let content = std::fs::read_to_string(p).ok()?;
            let h = dstv::parse_header(&content);
            if h.mark.is_empty() {
                return None;
            }
            let np = norm(p);
            let lower = np.to_lowercase();
            let category = if lower.contains("plate") || h.is_plate() {
                "Plate"
            } else {
                "Profile"
            }
            .to_string();
            // thickness group = parent folder if it looks like "PLxx"
            let thickness_group = p
                .parent()
                .and_then(|d| d.file_name())
                .map(|s| s.to_string_lossy().to_string())
                .filter(|s| s.to_uppercase().starts_with("PL"));
            let mark_lc = h.mark.to_lowercase();
            Some(Part {
                weight_kg: h.weight_kg(),
                dxf_path: dxf_by_mark.get(&mark_lc).cloned(),
                pdf_path: single_pdf_by_mark
                    .get(&mark_lc)
                    .or_else(|| any_pdf_by_mark.get(&mark_lc))
                    .cloned(),
                nc1_path: Some(np),
                mark: h.mark,
                name: h.part_name,
                category,
                profile: h.profile,
                profile_type: h.profile_type,
                material: h.material,
                length_mm: h.length_mm,
                width_mm: h.width_mm,
                height_mm: h.height_mm,
                flange_t_mm: h.flange_t_mm,
                web_t_mm: h.web_t_mm,
                radius_mm: h.radius_mm,
                weight_per_m: h.weight_per_m,
                quantity: h.quantity,
                thickness_group,
                parent_assembly: h.parent_assembly,
            })
        })
        .collect();

    // For projects whose parts come as per-part DXF cut files (no DSTV .nc1,
    // e.g. Tekla "DXF Files" exports), register each DXF as a plate part so the
    // catalog + sidebar populate and the part's 3D can be extruded from the DXF
    // outline — same instant experience as .nc1, no IFC and no extraction.
    let mut existing: std::collections::HashSet<String> =
        parts.iter().map(|p| p.mark.to_lowercase()).collect();
    let dxf_parts: Vec<(String, Part)> = dxf_files
        .par_iter()
        .filter_map(|p| {
            let stem = p
                .file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_default();
            let mark = mark_from_filename(&stem);
            if mark.is_empty() {
                return None;
            }
            let mark_lc = mark.to_lowercase();
            let info = dxf_plate_info(p);
            Some((
                mark_lc.clone(),
                Part {
                    mark,
                    name: "PLATE".to_string(),
                    category: "Plate".to_string(),
                    profile: info.thickness_group.clone().unwrap_or_else(|| "Plate".to_string()),
                    profile_type: "plate".to_string(),
                    material: info.material.unwrap_or_default(),
                    length_mm: info.length_mm,
                    width_mm: info.width_mm,
                    height_mm: info.width_mm, // plate "Width" field reads height_mm
                    flange_t_mm: info.thickness.unwrap_or(0.0),
                    web_t_mm: 0.0,
                    radius_mm: 0.0,
                    weight_per_m: 0.0,
                    weight_kg: info.weight_kg,
                    quantity: 1,
                    thickness_group: info.thickness_group,
                    parent_assembly: String::new(),
                    nc1_path: None,
                    pdf_path: single_pdf_by_mark
                        .get(&mark_lc)
                        .or_else(|| any_pdf_by_mark.get(&mark_lc))
                        .cloned(),
                    dxf_path: Some(norm(p)),
                },
            ))
        })
        .collect();
    // Keep only DXF parts whose mark isn't already a real (nc1) part — dedupe
    // sequentially since the parse ran in parallel.
    for (mark_lc, part) in dxf_parts {
        if existing.insert(mark_lc) {
            parts.push(part);
        }
    }

    // Link parts -> parent assemblies.
    for part in &parts {
        let key = part.parent_assembly.to_lowercase();
        if let Some(&i) = assembly_idx.get(&key) {
            assemblies[i].part_marks.push(part.mark.clone());
        }
    }

    // Stats.
    let mut by_category: HashMap<String, usize> = HashMap::new();
    let mut total_weight = 0.0;
    let mut part_instances: u64 = 0;
    for p in &parts {
        *by_category.entry(p.category.clone()).or_insert(0) += 1;
        total_weight += p.weight_kg * p.quantity.max(1) as f64;
        part_instances += p.quantity.max(1) as u64;
    }

    let stats = Stats {
        assemblies: assemblies.len(),
        parts: parts.len(),
        part_instances,
        total_weight_kg: total_weight,
        pdfs: pdf_files.len(),
        dwgs: dwg_files.len(),
        nc1: nc1_files.len(),
        dxf: dxf_files.len(),
        by_category,
    };

    let name = root_path
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| root.to_string());

    Ok(ProjectIndex {
        root: norm(&root_path),
        name,
        logo_path,
        ifc_path,
        assemblies,
        parts,
        reports,
        stats,
    })
}
