from __future__ import annotations

import csv
import re
import unicodedata
from pathlib import Path

import fitz  # PyMuPDF


ROOT = Path(
    r"C:\Users\user\Documents\taff\ELNAGAR-IFF-REV00\ELNAGAR-IFF-REV00\madar\Madar Group _ For Fabrication\Madar Group ~ For Fabrication"
)
OUT_ROOT = ROOT / "_page_extract"

MARK_RE = re.compile(r"(?<!\d)(\d+-[A-Za-z0-9]+)\b")
DATE_RE = re.compile(r"^\d{2}-\d{2}$")
E_SHEET_RE = re.compile(r"^E\d+$")


def ascii_safe(text: str) -> str:
    normalized = unicodedata.normalize("NFKD", text)
    return normalized.encode("ascii", "ignore").decode("ascii")


def clean_name(text: str) -> str:
    text = text.strip()
    text = re.sub(r"^[xX]\s*-\s*", "", text)
    text = re.sub(r"^[xX]\s+", "", text)
    text = text.strip(" -_")
    return text


def slugify(text: str) -> str:
    text = ascii_safe(clean_name(text))
    text = text.replace("&", " and ")
    text = re.sub(r"[^A-Za-z0-9-]+", "_", text)
    text = re.sub(r"_+", "_", text).strip("_")
    return text or "page"


def detect_mark(text: str) -> str:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    for line in lines:
        for match in MARK_RE.findall(line):
            if not DATE_RE.match(match):
                return clean_name(match)
    return ""


def detect_erection_title(text: str) -> str:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    in_title = False
    title_parts: list[str] = []
    for line in lines:
        if line == "STEEL STRUCTURE":
            in_title = True
            continue
        if not in_title:
            continue
        if E_SHEET_RE.match(line):
            break
        if line in {"--", "-------------"}:
            continue
        if line in {"DRAWING TITLE:", "CHECKED BY", "DATE", "SCALE", "SHEET NO.", "CONTRACTOR:", "PROJECT NAME:"}:
            continue
        if line.startswith("Tekla"):
            continue
        title_parts.append(line)
        # The first meaningful line after "STEEL STRUCTURE" is usually the title.
        if title_parts:
            break
    return " ".join(title_parts).strip()


def detect_label(pdf_name: str, page_index: int, text: str) -> str:
    if pdf_name == "3-Erection Drawings.pdf":
        title = detect_erection_title(text)
        if title:
            return title

    mark = detect_mark(text)
    if mark:
        return mark

    if pdf_name == "3-Erection Drawings.pdf":
        return f"sheet-{page_index + 1:03d}"
    return f"page-{page_index + 1:03d}"


def main() -> None:
    OUT_ROOT.mkdir(parents=True, exist_ok=True)
    manifest_path = OUT_ROOT / "manifest.csv"

    rows = []
    pdfs = sorted(
        p
        for p in ROOT.glob("*.pdf")
        if p.is_file() and p.parent == ROOT and p.name != manifest_path.name
    )

    for pdf_path in pdfs:
        doc = fitz.open(str(pdf_path))
        pdf_out_dir = OUT_ROOT / pdf_path.stem
        pdf_out_dir.mkdir(parents=True, exist_ok=True)
        used_names: dict[str, int] = {}

        for page_index in range(doc.page_count):
            page = doc.load_page(page_index)
            text = page.get_text("text") or ""
            label = detect_label(pdf_path.name, page_index, text)
            label = clean_name(label)
            safe_label = slugify(label)
            seen = used_names.get(safe_label, 0) + 1
            used_names[safe_label] = seen
            basename = safe_label if seen == 1 else f"{safe_label}__{seen}"

            single = fitz.open()
            single.insert_pdf(doc, from_page=page_index, to_page=page_index)

            out_pdf = pdf_out_dir / f"{basename}.pdf"
            out_txt = pdf_out_dir / f"{basename}.txt"

            single.save(str(out_pdf), deflate=True, clean=True)
            out_txt.write_text(text, encoding="utf-8")

            rows.append(
                {
                    "source_pdf": pdf_path.name,
                    "page_number": page_index + 1,
                    "label": label,
                    "output_pdf": str(out_pdf.relative_to(OUT_ROOT)).replace("\\", "/"),
                    "output_txt": str(out_txt.relative_to(OUT_ROOT)).replace("\\", "/"),
                    "chars": len(text),
                }
            )

    with manifest_path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(
            fh,
            fieldnames=[
                "source_pdf",
                "page_number",
                "label",
                "output_pdf",
                "output_txt",
                "chars",
            ],
        )
        writer.writeheader()
        writer.writerows(rows)

    print(f"wrote {len(rows)} pages to {OUT_ROOT}")


if __name__ == "__main__":
    main()
