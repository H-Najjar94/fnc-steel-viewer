import { useEffect, useState } from "react";
import PdfViewer from "./PdfViewer";
import type { DrawingRef } from "../../types";

// Shows one PDF drawing, with a selector when a mark has several
// (Assembly / Single Part / Revision / Erection).
export default function DrawingViewer({ drawings }: { drawings: DrawingRef[] }) {
  const [idx, setIdx] = useState(0);

  // Reset to the first drawing whenever the set changes (new selection).
  useEffect(() => {
    setIdx(0);
  }, [drawings]);

  if (drawings.length === 0)
    return (
      <div className="flex h-full items-center justify-center text-sm text-fnc-steel">
        No PDF drawing for this item.
      </div>
    );

  const current = drawings[Math.min(idx, drawings.length - 1)];

  return (
    <div className="flex h-full flex-col">
      {drawings.length > 1 && (
        <div className="flex flex-wrap items-center gap-1 border-b border-fnc-border bg-fnc-panel px-2 py-1.5">
          {drawings.map((d, i) => (
            <button
              key={`${d.kind}-${i}`}
              onClick={() => setIdx(i)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                i === idx ? "bg-fnc-red text-white" : "text-fnc-steel hover:bg-fnc-panel-2 hover:text-white"
              }`}
              title={d.path}
            >
              {d.kind}
              {d.kind === "Revision" && " ★"}
            </button>
          ))}
        </div>
      )}
      <div className="min-h-0 flex-1">
        <PdfViewer key={current.path} path={current.path} />
      </div>
    </div>
  );
}
