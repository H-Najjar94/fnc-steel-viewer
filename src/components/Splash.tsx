import { useState } from "react";
import { useStore } from "../store";
import { basename } from "../lib/format";
import { DEFAULT_PROJECT_ROOT, getAllProjects } from "../config";
import NewProjectModal from "./NewProjectModal";
import logo from "../assets/fnc-logo.png";

export default function Splash() {
  const { loading, error, recents, openProject } = useStore();
  const [showAdd, setShowAdd] = useState(false);
  const projects = getAllProjects();

  // Auto-loading the default project: show a focused loading screen.
  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-fnc-bg px-8">
        <img src={logo} alt="FNC Steel Constructions" className="mb-8 h-24 object-contain" />
        <div className="flex items-center gap-3 text-fnc-steel">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-fnc-red border-t-transparent" />
          <span>
            Loading{" "}
            <span className="font-medium text-white">
              {basename(DEFAULT_PROJECT_ROOT ?? "") || "project"}
            </span>
            …
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center bg-fnc-bg px-8">
      <div className="w-full max-w-xl rounded-2xl border border-fnc-border bg-fnc-panel p-10 shadow-2xl">
        <div className="mb-8 flex justify-center">
          <img src={logo} alt="FNC Steel Constructions" className="h-24 object-contain" />
        </div>
        <h1 className="mb-1 text-center text-2xl font-semibold tracking-tight text-white">
          FNC Steel Viewer
        </h1>
        <p className="mb-8 text-center text-sm text-fnc-steel">
          Open a project folder to browse drawings, parts, CNC data and reports.
        </p>

        <button
          onClick={() => setShowAdd(true)}
          disabled={loading}
          className="mx-auto flex items-center gap-2 rounded-lg bg-fnc-red px-6 py-3 font-medium text-white transition hover:bg-fnc-red-dark disabled:opacity-50"
        >
          + Add new project
        </button>

        {error && (
          <p className="mt-6 rounded-lg bg-red-950/60 p-3 text-center text-sm text-red-300">
            {error}
          </p>
        )}

        {!loading && (
          <div className="mt-8">
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-fnc-steel">
              Projects
            </div>
            <ul className="space-y-1">
              {projects.map((p) => (
                <li key={p.root}>
                  <button
                    onClick={() => openProject(p.root)}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-white transition hover:bg-fnc-panel-2"
                    title={p.root}
                  >
                    <span className="inline-block h-2 w-2 rounded-full bg-fnc-red" />
                    {p.name}
                    {p.custom && <span className="ml-1 text-[10px] text-fnc-steel">(added)</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {recents.length > 0 && !loading && (
          <div className="mt-8">
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-fnc-steel">
              Recent
            </div>
            <ul className="space-y-1">
              {recents.map((r) => (
                <li key={r}>
                  <button
                    onClick={() => openProject(r)}
                    className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm text-fnc-steel transition hover:bg-fnc-panel-2 hover:text-white"
                    title={r}
                  >
                    <span className="truncate font-medium text-white">{basename(r)}</span>
                    <span className="ml-3 truncate text-xs text-fnc-steel">{r}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <p className="mt-6 text-xs text-fnc-steel/60">
        Files are read locally and never leave this machine.
      </p>
      {showAdd && <NewProjectModal onClose={() => setShowAdd(false)} />}
    </div>
  );
}
