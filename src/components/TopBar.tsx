import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useStore } from "../store";
import { num, kg } from "../lib/format";
import { PROJECTS } from "../config";
import logo from "../assets/fnc-logo.png";

export default function TopBar() {
  const { project, search, setSearch, selectByMark, mainView, setMainView, reload, closeProject, openProject } =
    useStore();
  const [fullscreen, setFullscreen] = useState(false);
  const [projMenu, setProjMenu] = useState(false);

  useEffect(() => {
    if (!projMenu) return;
    const close = () => setProjMenu(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [projMenu]);

  // Fullscreen toggle (button + F11). Kiosk-friendly for the shop floor.
  useEffect(() => {
    const win = getCurrentWindow();
    win.isFullscreen().then(setFullscreen).catch(() => {});
    const toggle = async () => {
      const next = !(await win.isFullscreen());
      await win.setFullscreen(next);
      setFullscreen(next);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F11") {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggleFullscreen = async () => {
    const win = getCurrentWindow();
    const next = !(await win.isFullscreen());
    await win.setFullscreen(next);
    setFullscreen(next);
  };

  if (!project) return null;
  const s = project.stats;

  return (
    <header className="flex items-center gap-4 border-b border-fnc-border bg-fnc-panel px-4 py-2">
      <img src={logo} alt="FNC" className="h-9 object-contain" />
      <div className="relative min-w-0">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setProjMenu((v) => !v);
          }}
          className="flex items-center gap-1.5 text-left"
          title="Switch project"
        >
          <span className="truncate text-sm font-semibold text-white">{project.name}</span>
          <span className="text-fnc-steel">▾</span>
        </button>
        <div className="truncate text-[11px] text-fnc-steel">
          {num(s.assemblies)} assemblies · {num(s.parts)} parts · {kg(s.total_weight_kg)}
          {project.ifc_path ? " · IFC ✓" : ""}
        </div>
        {projMenu && (
          <div className="absolute left-0 top-full z-50 mt-1 w-56 overflow-hidden rounded-md border border-fnc-border bg-fnc-panel py-1 shadow-xl">
            {PROJECTS.map((p) => (
              <button
                key={p.root}
                onClick={() => {
                  setProjMenu(false);
                  if (p.root !== project.root) openProject(p.root);
                }}
                className={`block w-full px-3 py-2 text-left text-sm transition hover:bg-fnc-panel-2 ${
                  p.root === project.root ? "text-fnc-red" : "text-white"
                }`}
              >
                {p.name}
                {p.root === project.root && " ✓"}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="relative ml-4 flex-1 max-w-md">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && search.trim()) selectByMark(search.trim());
          }}
          placeholder="Search mark, profile, name…  (e.g. C48, IF106, IPE450)"
          className="w-full rounded-lg border border-fnc-border bg-fnc-bg px-3 py-2 text-sm text-white placeholder:text-fnc-steel/70 focus:border-fnc-red focus:outline-none"
        />
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Tab active={mainView === "catalog"} onClick={() => setMainView("catalog")}>
          Catalog
        </Tab>
        <Tab active={mainView === "reports"} onClick={() => setMainView("reports")}>
          Reports ({project.reports.length})
        </Tab>
        <button
          onClick={toggleFullscreen}
          className="rounded-md border border-fnc-border px-3 py-1.5 text-sm text-fnc-steel transition hover:bg-fnc-panel-2 hover:text-white"
          title="Toggle fullscreen (F11)"
        >
          {fullscreen ? "⛶ Exit Full" : "⛶ Fullscreen"}
        </button>
        <button
          onClick={reload}
          className="rounded-md border border-fnc-border px-3 py-1.5 text-sm text-fnc-steel transition hover:bg-fnc-panel-2 hover:text-white"
          title="Re-scan folder"
        >
          Reload
        </button>
        <button
          onClick={closeProject}
          className="rounded-md border border-fnc-border px-3 py-1.5 text-sm text-fnc-steel transition hover:bg-fnc-panel-2 hover:text-white"
        >
          Close
        </button>
      </div>
    </header>
  );
}

function Tab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
        active ? "bg-fnc-red text-white" : "text-fnc-steel hover:bg-fnc-panel-2 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}
