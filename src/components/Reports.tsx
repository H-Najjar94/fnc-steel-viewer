import { useEffect, useState } from "react";
import { useStore } from "../store";
import { readExcel } from "../lib/api";
import type { Workbook } from "../types";

export default function Reports() {
  const project = useStore((s) => s.project);
  const reports = project?.reports ?? [];
  const [activePath, setActivePath] = useState<string | null>(null);
  const [wb, setWb] = useState<Workbook | null>(null);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activePath && reports.length) setActivePath(reports[0].path);
  }, [reports, activePath]);

  useEffect(() => {
    if (!activePath) return;
    setLoading(true);
    setError(null);
    setWb(null);
    setSheetIdx(0);
    readExcel(activePath)
      .then(setWb)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [activePath]);

  const sheet = wb?.sheets[sheetIdx];

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-fnc-bg">
      <div className="flex items-center gap-2 border-b border-fnc-border bg-fnc-panel px-3 py-2">
        {reports.map((r) => (
          <button
            key={r.path}
            onClick={() => setActivePath(r.path)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              activePath === r.path
                ? "bg-fnc-red text-white"
                : "text-fnc-steel hover:bg-fnc-panel-2 hover:text-white"
            }`}
          >
            {r.name}
          </button>
        ))}
        {!reports.length && <span className="text-sm text-fnc-steel">No reports in project.</span>}
      </div>

      {wb && wb.sheets.length > 1 && (
        <div className="flex items-center gap-1 border-b border-fnc-border bg-fnc-bg px-3 py-1.5">
          {wb.sheets.map((s, i) => (
            <button
              key={s.name}
              onClick={() => setSheetIdx(i)}
              className={`rounded px-2 py-1 text-xs transition ${
                i === sheetIdx ? "bg-fnc-navy-light text-white" : "text-fnc-steel hover:text-white"
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto p-3">
        {loading && <p className="text-sm text-fnc-steel">Reading workbook…</p>}
        {error && <p className="text-sm text-red-300">{error}</p>}
        {sheet && (
          <table className="border-collapse text-xs">
            <tbody>
              {sheet.rows.slice(0, 5000).map((row, ri) => (
                <tr key={ri} className={ri === 0 ? "sticky top-0" : ""}>
                  {row.map((cell, ci) => (
                    <td
                      key={ci}
                      className={`whitespace-nowrap border border-fnc-border/50 px-2 py-1 ${
                        ri === 0
                          ? "bg-fnc-panel font-semibold text-white"
                          : "text-fnc-steel"
                      }`}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {sheet && sheet.rows.length > 5000 && (
          <p className="mt-2 text-xs text-fnc-steel">
            Showing first 5,000 of {sheet.rows.length.toLocaleString()} rows.
          </p>
        )}
      </div>
    </div>
  );
}
