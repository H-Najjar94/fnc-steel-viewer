import { useStore } from "../../store";
import { mm, kg, num } from "../../lib/format";

export default function DataTab() {
  const { selection, partsByMark, assembliesByMark } = useStore();
  if (!selection) return null;
  const key = selection.mark.toLowerCase();
  const part = selection.kind === "part" ? partsByMark.get(key) : undefined;
  const asm = selection.kind === "assembly" ? assembliesByMark.get(key) : undefined;

  const rows: [string, string][] = [];
  if (part) {
    rows.push(
      ["Mark", part.mark],
      ["Name", part.name],
      ["Category", part.category],
      ["Profile", part.profile],
      ["Profile type", part.profile_type],
      ["Material", part.material],
      ["Length", mm(part.length_mm)],
      ["Height / width", mm(part.height_mm)],
      ["Flange width", mm(part.width_mm)],
      ["Flange thickness", mm(part.flange_t_mm)],
      ["Web thickness", mm(part.web_t_mm)],
      ["Radius", mm(part.radius_mm)],
      [
        part.category === "Plate" ? "Weight / m²" : "Weight / m",
        `${num(part.weight_per_m, 2)} ${part.category === "Plate" ? "kg/m²" : "kg/m"}`,
      ],
      ["Unit weight", kg(part.weight_kg)],
      ["Quantity", num(part.quantity)],
      ["Thickness group", part.thickness_group || "—"],
      ["Parent assembly", part.parent_assembly || "—"],
      ["NC1 file", part.nc1_path || "—"],
      ["DXF file", part.dxf_path || "—"],
      ["PDF file", part.pdf_path || "—"]
    );
  } else if (asm) {
    rows.push(
      ["Mark", asm.mark],
      ["Name", asm.name],
      ["Part count", num(asm.part_marks.length)],
      ["DWG file", asm.dwg_path || "—"],
      ["PDF file", asm.pdf_path || "—"],
      ["Parts", asm.part_marks.join(", ") || "—"]
    );
  }

  return (
    <div className="h-full overflow-auto p-6">
      <table className="w-full max-w-3xl border-collapse text-sm">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k} className="border-b border-fnc-border/60">
              <td className="w-48 py-2 pr-4 align-top text-fnc-steel">{k}</td>
              <td className="break-all py-2 font-medium text-white">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
