//! Read BOM / MTO spreadsheets (.xlsx and binary .xlsb) via calamine.

use calamine::{open_workbook_auto, Data, Reader};
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct SheetData {
    pub name: String,
    pub rows: Vec<Vec<String>>,
}

#[derive(Debug, Clone, Serialize)]
pub struct Workbook {
    pub path: String,
    pub sheets: Vec<SheetData>,
}

fn cell_to_string(c: &Data) -> String {
    match c {
        Data::Empty => String::new(),
        Data::String(s) => s.clone(),
        Data::Float(f) => {
            // Show integers without trailing ".0".
            if f.fract() == 0.0 {
                format!("{}", *f as i64)
            } else {
                format!("{}", f)
            }
        }
        Data::Int(i) => i.to_string(),
        Data::Bool(b) => b.to_string(),
        Data::DateTime(d) => d.to_string(),
        Data::DateTimeIso(s) => s.clone(),
        Data::DurationIso(s) => s.clone(),
        Data::Error(e) => format!("#ERR:{:?}", e),
    }
}

pub fn read_workbook(path: &str) -> Result<Workbook, String> {
    let mut wb = open_workbook_auto(path).map_err(|e| format!("open failed: {e}"))?;
    let names = wb.sheet_names().to_vec();
    let mut sheets = Vec::new();
    for name in names {
        if let Ok(range) = wb.worksheet_range(&name) {
            let rows: Vec<Vec<String>> = range
                .rows()
                .map(|r| r.iter().map(cell_to_string).collect())
                .collect();
            sheets.push(SheetData { name, rows });
        }
    }
    Ok(Workbook {
        path: path.to_string(),
        sheets,
    })
}
