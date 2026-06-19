//! DSTV (NC1) parser for FNC steel parts.
//!
//! The ST header field order was reverse-engineered from FNC's export and
//! validated against known section properties (e.g. IPE450 = 450h/190w/14.6tf/
//! 9.4tw/21r/77.6 kg/m). Field layout, after the `ST` line and any `**` comments:
//!   0 order, 1 drawing, 2 piece-mark, 3 length, 4 qty, 5 profile, 6 material,
//!   7 height, 8 width, 9 flange-t, 10 web-t, 11 radius, 12 weight/m, 13 paint/m,
//!   then numeric placeholders, then text: parent-assembly, part-name, machine, project.
//! Geometry comes from `AK` (outer contour, by face) and `BO` (holes) blocks.

use serde::Serialize;

/// Two-letter DSTV block markers that terminate the ST header / a contour block.
const BLOCK_MARKERS: &[&str] = &[
    "AK", "IK", "BO", "SI", "SC", "KA", "KO", "PU", "EN", "ST", "BR", "TO", "UE", "PR",
];

fn is_block_marker(line: &str) -> bool {
    let t = line.trim();
    t.len() == 2 && BLOCK_MARKERS.contains(&t)
}

/// Parse the leading numeric portion of a DSTV token (values may carry a trailing
/// face/marking letter, e.g. "0.00s" or "610.00u").
fn lead_f64(s: &str) -> Option<f64> {
    let t = s.trim();
    if t.is_empty() {
        return None;
    }
    let mut end = 0;
    for (i, c) in t.char_indices() {
        if c.is_ascii_digit() || c == '.' || c == '-' || c == '+' {
            end = i + c.len_utf8();
        } else {
            break;
        }
    }
    if end == 0 {
        None
    } else {
        t[..end].parse::<f64>().ok()
    }
}

fn field(lines: &[String], i: usize) -> String {
    lines.get(i).map(|s| s.trim().to_string()).unwrap_or_default()
}

fn field_f64(lines: &[String], i: usize) -> f64 {
    lines.get(i).and_then(|s| lead_f64(s)).unwrap_or(0.0)
}

#[derive(Debug, Clone, Serialize, Default)]
pub struct PartHeader {
    pub order: String,
    pub drawing: String,
    pub mark: String,
    pub length_mm: f64,
    pub quantity: u32,
    pub profile: String,
    pub material: String,
    pub height_mm: f64,
    pub width_mm: f64,
    pub flange_t_mm: f64,
    pub web_t_mm: f64,
    pub radius_mm: f64,
    pub weight_per_m: f64,
    pub parent_assembly: String,
    pub part_name: String,
    /// "plate" | "i-section" | "angle" | "channel" | "rhs" | "chs" | "tee" | "flat" | "other"
    pub profile_type: String,
}

impl PartHeader {
    /// Per-piece weight in kg.
    ///
    /// In DSTV the ST weight field is per *running metre* for profiles (e.g. IPE450
    /// = 77.6 kg/m) but per *square metre* for plates (e.g. PLT10 = 78.5 kg/m²).
    /// Plate weight is therefore area (length × width) × kg/m².
    pub fn weight_kg(&self) -> f64 {
        if self.is_plate() {
            (self.length_mm / 1000.0) * (self.height_mm / 1000.0) * self.weight_per_m
        } else {
            self.weight_per_m * (self.length_mm / 1000.0)
        }
    }
    pub fn is_plate(&self) -> bool {
        self.profile_type == "plate"
    }
}

/// Classify a profile name into a coarse geometric family.
pub fn classify_profile(profile: &str) -> &'static str {
    let p = profile.trim().to_uppercase();
    let starts = |pats: &[&str]| pats.iter().any(|x| p.starts_with(x));
    if starts(&["PLT", "PL", "FL", "BL", "PLATE", "FLAT"]) {
        "plate"
    } else if starts(&["IPE", "HE", "HEA", "HEB", "HEM", "UB", "UC", "W", "I", "H", "SB"]) {
        "i-section"
    } else if starts(&["RHS", "SHS", "BOX", "HSS", "MSH", "RRH", "RHH"]) {
        "rhs"
    } else if starts(&["CHS", "RO", "RD", "PIPE", "ROUND", "ROR", "DIA", "O"]) {
        "chs"
    } else if starts(&["UPN", "UAP", "PFC", "U", "C", "CFC"]) {
        "channel"
    } else if starts(&["T", "TEE"]) {
        "tee"
    } else if starts(&["L", "RSA", "EA", "UA"]) {
        "angle"
    } else {
        "other"
    }
}

/// Parse just the ST header of an .nc1 file content.
pub fn parse_header(content: &str) -> PartHeader {
    // Collect the lines that belong to the header: everything after `ST`, skipping
    // `**` comments, up to the first block marker.
    let mut header: Vec<String> = Vec::new();
    let mut seen_st = false;
    for raw in content.lines() {
        let t = raw.trim();
        if !seen_st {
            if t == "ST" {
                seen_st = true;
            }
            continue;
        }
        if t.starts_with("**") {
            continue;
        }
        if is_block_marker(raw) {
            break;
        }
        header.push(raw.to_string());
    }

    let profile = field(&header, 5);
    let profile_type = classify_profile(&profile).to_string();

    // Text tail (parent assembly, part name) = first non-numeric lines from idx 14 on.
    let mut texts: Vec<String> = Vec::new();
    for l in header.iter().skip(14) {
        let t = l.trim();
        if t.is_empty() {
            continue;
        }
        // A pure-numeric placeholder (e.g. "0.000") is not a text field.
        if t.parse::<f64>().is_ok() {
            continue;
        }
        texts.push(t.to_string());
    }

    PartHeader {
        order: field(&header, 0),
        drawing: field(&header, 1),
        mark: field(&header, 2),
        length_mm: field_f64(&header, 3),
        quantity: field_f64(&header, 4) as u32,
        profile,
        material: field(&header, 6),
        height_mm: field_f64(&header, 7),
        width_mm: field_f64(&header, 8),
        flange_t_mm: field_f64(&header, 9),
        web_t_mm: field_f64(&header, 10),
        radius_mm: field_f64(&header, 11),
        weight_per_m: field_f64(&header, 12),
        parent_assembly: texts.get(0).cloned().unwrap_or_default(),
        part_name: texts.get(1).cloned().unwrap_or_default(),
        profile_type,
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct Hole {
    pub x: f64,
    pub y: f64,
    pub d: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct PartGeometry {
    pub mark: String,
    pub kind: String, // "plate" | "profile"
    pub profile: String,
    pub profile_type: String,
    pub length_mm: f64,
    pub height_mm: f64,
    pub width_mm: f64,
    pub flange_t_mm: f64,
    pub web_t_mm: f64,
    pub radius_mm: f64,
    /// Outer contour of the main face (X,Y), used directly for plates.
    pub outline: Vec<[f64; 2]>,
    pub thickness_mm: f64,
    pub holes: Vec<Hole>,
}

/// Extract geometry (outline + holes) for 3D reconstruction.
pub fn parse_geometry(content: &str) -> PartGeometry {
    let h = parse_header(content);

    // First AK contour (the main / "v" front face) -> outline. First BO block -> holes.
    let mut outline: Vec<[f64; 2]> = Vec::new();
    let mut holes: Vec<Hole> = Vec::new();
    let mut section: Option<&str> = None;
    let mut took_outline = false;

    for raw in content.lines() {
        let t = raw.trim();
        if is_block_marker(raw) {
            section = Some(match t {
                "AK" => "AK",
                "BO" => "BO",
                "IK" => "IK",
                other => other,
            });
            // We only want the FIRST AK face for the outline.
            if t == "AK" && !outline.is_empty() {
                took_outline = true;
            }
            continue;
        }
        match section {
            Some("AK") if !took_outline => {
                // tokens: [face?] X Y ...  (face letter only on first vertex)
                let nums: Vec<f64> = t
                    .split_whitespace()
                    .filter_map(|tok| lead_f64(tok))
                    .collect();
                if nums.len() >= 2 {
                    outline.push([nums[0], nums[1]]);
                }
            }
            Some("BO") => {
                let nums: Vec<f64> = t
                    .split_whitespace()
                    .filter_map(|tok| lead_f64(tok))
                    .collect();
                if nums.len() >= 3 {
                    holes.push(Hole {
                        x: nums[0],
                        y: nums[1],
                        d: nums[2],
                    });
                }
            }
            _ => {}
        }
    }

    let kind = if h.is_plate() { "plate" } else { "profile" };
    let thickness = if h.is_plate() {
        // For a plate the thickness is the flange/web value (all equal in FNC export).
        if h.flange_t_mm > 0.0 {
            h.flange_t_mm
        } else {
            h.web_t_mm
        }
    } else {
        h.flange_t_mm
    };

    PartGeometry {
        mark: h.mark,
        kind: kind.to_string(),
        profile: h.profile,
        profile_type: h.profile_type,
        length_mm: h.length_mm,
        height_mm: h.height_mm,
        width_mm: h.width_mm,
        flange_t_mm: h.flange_t_mm,
        web_t_mm: h.web_t_mm,
        radius_mm: h.radius_mm,
        outline,
        thickness_mm: thickness,
        holes,
    }
}
