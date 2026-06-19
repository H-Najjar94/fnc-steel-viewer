import { useStore, type ViewerTab } from "../store";
import Tabs from "./Tabs";
import Viewer3D from "./viewers/Viewer3D";
import CadViewer from "./viewers/CadViewer";
import DrawingViewer from "./viewers/DrawingViewer";
import CncViewer from "./viewers/CncViewer";
import DataTab from "./viewers/DataTab";
import type { DrawingRef } from "../types";

const TABS: { id: ViewerTab; label: string }[] = [
  { id: "3d", label: "3D" },
  { id: "cad", label: "CAD" },
  { id: "pdf", label: "Drawing" },
  { id: "cnc", label: "CNC" },
  { id: "data", label: "Data" },
];

export default function ViewerPanel() {
  const {
    project,
    selection,
    viewerTab,
    setViewerTab,
    viewerMaximized,
    toggleViewerMaximized,
    partsByMark,
    assembliesByMark,
  } = useStore();

  const key = selection?.mark.toLowerCase() ?? "";
  const part = selection?.kind === "part" ? partsByMark.get(key) : undefined;
  const asm = selection?.kind === "assembly" ? assembliesByMark.get(key) : undefined;

  // All drawings for the selection (assembly may have several: Assembly / Single /
  // Revision). Parts have a single drawing.
  const drawings: DrawingRef[] =
    asm?.drawings && asm.drawings.length
      ? asm.drawings
      : part?.pdf_path
      ? [{ kind: "Drawing", path: part.pdf_path }]
      : asm?.pdf_path
      ? [{ kind: "Drawing", path: asm.pdf_path }]
      : [];

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-fnc-bg">
      <Tabs />
      <div className="flex items-center gap-1 border-b border-fnc-border bg-fnc-panel px-2 py-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setViewerTab(t.id)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
              viewerTab === t.id
                ? "bg-fnc-red text-white"
                : "text-fnc-steel hover:bg-fnc-panel-2 hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
        <button
          onClick={toggleViewerMaximized}
          className="ml-auto rounded-md border border-fnc-border px-3 py-1.5 text-sm text-fnc-steel transition hover:bg-fnc-panel-2 hover:text-white"
          title={viewerMaximized ? "Restore panels" : "Maximize viewer"}
        >
          {viewerMaximized ? "⮌ Restore" : "⛶ Maximize"}
        </button>
      </div>

      <div className="relative min-h-0 flex-1">
        {!selection ? (
          <Empty>Select a part or assembly.</Empty>
        ) : viewerTab === "3d" ? (
          <Viewer3D
            part={part}
            ifcPath={project?.ifc_path ?? null}
            isAssembly={!!asm}
            assemblyMark={asm?.mark}
          />
        ) : viewerTab === "cad" ? (
          <CadViewer part={part} asm={asm} />
        ) : viewerTab === "pdf" ? (
          <DrawingViewer drawings={drawings} />
        ) : viewerTab === "cnc" ? (
          part ? <CncViewer part={part} /> : <Empty>CNC data applies to single parts.</Empty>
        ) : (
          <DataTab />
        )}
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center text-sm text-fnc-steel">{children}</div>
  );
}
