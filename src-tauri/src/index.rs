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
    let parts: Vec<Part> = nc1_files
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
