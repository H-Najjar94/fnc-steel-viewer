//! Dev tool: scan a project folder and print a summary.
//! Usage: cargo run --example scan -- "C:/path/to/project"

use fnc_viewer_lib::{excel, index};

fn main() {
    let root = std::env::args().nth(1).expect("pass a project folder path");
    let idx = index::scan(&root, &[]).expect("scan failed");
    let s = &idx.stats;
    println!("Project: {}", idx.name);
    println!("  assemblies : {}", s.assemblies);
    println!("  parts      : {}", s.parts);
    println!("  part inst. : {}", s.part_instances);
    println!("  total wt   : {:.0} kg", s.total_weight_kg);
    println!("  pdf/dwg    : {} / {}", s.pdfs, s.dwgs);
    println!("  nc1/dxf    : {} / {}", s.nc1, s.dxf);
    println!("  by category: {:?}", s.by_category);
    println!("  ifc        : {:?}", idx.ifc_path);
    println!("  logo       : {:?}", idx.logo_path);
    println!("  reports    : {}", idx.reports.len());

    println!("\nSample parts:");
    for p in idx.parts.iter().take(6) {
        println!(
            "  {:<8} {:<14} {:<8} L={:>8.1}mm  {:>7.1}kg  x{}  parent={}  pdf={}  dxf={}",
            p.mark,
            p.profile,
            p.material,
            p.length_mm,
            p.weight_kg,
            p.quantity,
            p.parent_assembly,
            p.pdf_path.is_some(),
            p.dxf_path.is_some(),
        );
    }

    // Link coverage
    let linked_pdf = idx.parts.iter().filter(|p| p.pdf_path.is_some()).count();
    let linked_dxf = idx.parts.iter().filter(|p| p.dxf_path.is_some()).count();
    let with_parent = idx.parts.iter().filter(|p| !p.parent_assembly.is_empty()).count();
    println!(
        "\nLink coverage: pdf {}/{}  dxf {}/{}  parent {}/{}",
        linked_pdf, s.parts, linked_dxf, s.parts, with_parent, s.parts
    );

    println!("\nSample assemblies:");
    for a in idx.assemblies.iter().take(4) {
        println!("  {:<8} {:<16} parts={}  pdf={}", a.mark, a.name, a.part_marks.len(), a.pdf_path.is_some());
    }

    println!("\nReports:");
    for r in &idx.reports {
        match excel::read_workbook(&r.path) {
            Ok(wb) => {
                println!("  {} ({}) -> {} sheet(s)", r.name, r.ext, wb.sheets.len());
                for sh in wb.sheets.iter().take(3) {
                    println!("     [{}] {} rows", sh.name, sh.rows.len());
                }
            }
            Err(e) => println!("  {} ({}) -> ERROR {}", r.name, r.ext, e),
        }
    }
}
