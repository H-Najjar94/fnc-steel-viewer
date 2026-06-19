pub mod dstv;
pub mod excel;
pub mod index;

use sha2::{Digest, Sha256};
use std::path::PathBuf;

fn cache_dir() -> Option<PathBuf> {
    dirs::data_dir().map(|d| d.join("fnc-viewer").join("cache"))
}

fn cache_file(root: &str) -> Option<PathBuf> {
    let mut hasher = Sha256::new();
    hasher.update(root.replace('\\', "/").to_lowercase().as_bytes());
    let hash = format!("{:x}", hasher.finalize());
    cache_dir().map(|d| d.join(format!("{}.json", &hash[..16])))
}

fn has_ifc_file(root: &str) -> bool {
    walkdir::WalkDir::new(root)
        .into_iter()
        .filter_map(|e| e.ok())
        .any(|e| e.file_type().is_file() && e.path().extension().is_some_and(|x| x.eq_ignore_ascii_case("ifc")))
}

/// Scan a project folder and build the relational index.
/// When `use_cache` is true and a cached index exists, it is returned instead.
#[tauri::command]
fn scan_project(
    root: String,
    use_cache: bool,
    excludes: Option<Vec<String>>,
) -> Result<index::ProjectIndex, String> {
    if use_cache {
        if let Some(cf) = cache_file(&root) {
            if let Ok(txt) = std::fs::read_to_string(&cf) {
                if let Ok(idx) = serde_json::from_str::<index::ProjectIndex>(&txt) {
                    if idx.ifc_path.is_none() && has_ifc_file(&root) {
                        // Cache is stale: the project gained an IFC after the last scan.
                    } else {
                        return Ok(idx);
                    }
                }
            }
        }
    }
    let idx = index::scan(&root, &excludes.unwrap_or_default())?;
    // Best-effort cache write.
    if let Some(cf) = cache_file(&root) {
        if let Some(parent) = cf.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Ok(txt) = serde_json::to_string(&idx) {
            let _ = std::fs::write(&cf, txt);
        }
    }
    Ok(idx)
}

/// Return parsed geometry (outline + holes + section dims) for 3D reconstruction.
#[tauri::command]
fn get_part_geometry(nc1_path: String) -> Result<dstv::PartGeometry, String> {
    let content = std::fs::read_to_string(&nc1_path).map_err(|e| e.to_string())?;
    Ok(dstv::parse_geometry(&content))
}

/// Raw text of an .nc1 file (for the CNC tab).
#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

/// Raw bytes of a file (PDF / DXF), returned for the webview to render.
#[tauri::command]
fn read_file_bytes(path: String) -> Result<Vec<u8>, String> {
    std::fs::read(&path).map_err(|e| e.to_string())
}

/// Read a BOM/MTO workbook (.xlsx / .xlsb).
#[tauri::command]
fn read_excel(path: String) -> Result<excel::Workbook, String> {
    excel::read_workbook(&path)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            scan_project,
            get_part_geometry,
            read_text_file,
            read_file_bytes,
            read_excel
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
