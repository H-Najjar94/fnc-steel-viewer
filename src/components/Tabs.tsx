import { useEffect, useState } from "react";
import { useStore } from "../store";

export default function Tabs() {
  const { trail, pos, jumpTo, back, forward, closeTab, closeOthers, closeAll } = useStore();
  const [menu, setMenu] = useState<{ x: number; y: number; index: number } | null>(null);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("contextmenu", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("contextmenu", close);
    };
  }, [menu]);

  if (trail.length === 0) return null;

  return (
    <div className="flex items-stretch border-b border-fnc-border bg-fnc-panel text-xs">
      <button onClick={back} disabled={pos <= 0} title="Back" className="px-2 text-fnc-steel hover:text-white disabled:opacity-30">
        ←
      </button>
      <button onClick={forward} disabled={pos >= trail.length - 1} title="Forward" className="px-2 text-fnc-steel hover:text-white disabled:opacity-30">
        →
      </button>
      <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto">
        {trail.map((s, i) => (
          <div
            key={`${s.kind}-${s.mark}-${i}`}
            onClick={() => jumpTo(i)}
            onAuxClick={(e) => {
              if (e.button === 1) {
                e.preventDefault();
                closeTab(i);
              }
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu({ x: e.clientX, y: e.clientY, index: i });
            }}
            className={`group flex shrink-0 cursor-pointer items-center gap-1.5 border-r border-fnc-border px-3 py-1.5 ${
              i === pos ? "bg-fnc-bg text-white" : "text-fnc-steel hover:bg-fnc-panel-2"
            }`}
            title={`${s.kind} ${s.mark} — middle-click or × to close, right-click for more`}
          >
            <span className={`inline-block h-2 w-2 rounded-full ${s.kind === "assembly" ? "bg-fnc-red" : "bg-fnc-steel"}`} />
            <span>{s.mark}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                closeTab(i);
              }}
              className="ml-1 rounded px-1 text-fnc-steel/60 hover:bg-fnc-border hover:text-white"
              title="Close"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {menu && (
        <div
          className="fixed z-50 min-w-40 overflow-hidden rounded-md border border-fnc-border bg-fnc-panel py-1 text-xs text-white shadow-xl"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <MenuItem onClick={() => { closeTab(menu.index); setMenu(null); }}>Close</MenuItem>
          <MenuItem onClick={() => { closeOthers(menu.index); setMenu(null); }}>Close others</MenuItem>
          <MenuItem onClick={() => { closeAll(); setMenu(null); }}>Close all</MenuItem>
        </div>
      )}
    </div>
  );
}

function MenuItem({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="block w-full px-3 py-1.5 text-left hover:bg-fnc-navy-light">
      {children}
    </button>
  );
}
