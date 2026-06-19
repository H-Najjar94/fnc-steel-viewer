import { useEffect, useLayoutEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { readFileBytes } from "../../lib/api";
import { basename } from "../../lib/format";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 12;
const MAX_RENDER_ZOOM = 4; // cap bitmap resolution; CSS stretches beyond this
const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

export default function PdfViewer({ path }: { path: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevZoom = useRef(1);
  const anchor = useRef<{ x: number; y: number } | null>(null);

  const [doc, setDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [aspect, setAspect] = useState(1.414); // page height / width
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Load document when the selected file changes.
  useEffect(() => {
    let alive = true;
    let loaded: pdfjsLib.PDFDocumentProxy | null = null;
    setLoading(true);
    setError(null);
    setPage(1);
    setZoom(1);
    setDoc(null);
    (async () => {
      try {
        const bytes = await readFileBytes(path);
        const d = await pdfjsLib.getDocument({ data: bytes }).promise;
        if (!alive) {
          (d as unknown as { destroy?: () => void }).destroy?.();
          return;
        }
        loaded = d;
        setDoc(d);
        setNumPages(d.numPages);
      } catch (e) {
        if (alive) setError(String(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
      (loaded as unknown as { destroy?: () => void } | null)?.destroy?.();
    };
  }, [path]);

  // Draw the page bitmap at the (capped) zoom for crispness.
  async function renderAt(targetZoom: number) {
    const canvas = canvasRef.current;
    const el = scrollRef.current;
    if (!doc || !canvas || !el) return;
    const pg = await doc.getPage(page);
    const base = pg.getViewport({ scale: 1 });
    setAspect(base.height / base.width);
    const fit = (el.clientWidth - 48) / base.width;
    const renderZoom = Math.min(targetZoom, MAX_RENDER_ZOOM);
    const viewport = pg.getViewport({ scale: fit * renderZoom });
    const outputScale = Math.max(window.devicePixelRatio || 1, 2);
    const ctx = canvas.getContext("2d")!;
    canvas.width = Math.floor(viewport.width * outputScale);
    canvas.height = Math.floor(viewport.height * outputScale);
    const transform =
      outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined;
    await pg.render({ canvasContext: ctx, viewport, canvas, transform }).promise;
  }

  // Re-render on document/page change (immediate) and on zoom settle (debounced).
  useEffect(() => {
    if (doc) renderAt(zoom);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, page]);
  useEffect(() => {
    if (!doc) return;
    const id = setTimeout(() => renderAt(zoom), 120);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]);

  // Display size is driven purely by zoom (so scrollbars are correct); the bitmap
  // is stretched via CSS. On zoom change, keep the anchor point (cursor, else
  // center) fixed by adjusting scroll — this pans *inside* the drawing.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const canvas = canvasRef.current;
    if (!el || !canvas) return;
    const displayW = (el.clientWidth - 48) * zoom;
    const displayH = displayW * aspect;
    canvas.style.width = `${displayW}px`;
    canvas.style.height = `${displayH}px`;

    const prev = prevZoom.current;
    if (prev !== zoom) {
      const ratio = zoom / prev;
      const a = anchor.current ?? { x: el.clientWidth / 2, y: el.clientHeight / 2 };
      el.scrollLeft = (el.scrollLeft + a.x) * ratio - a.x;
      el.scrollTop = (el.scrollTop + a.y) * ratio - a.y;
      anchor.current = null;
      prevZoom.current = zoom;
    }
  }, [zoom, aspect, doc, page]);

  // Industry-standard trackpad handling (Figma/Excalidraw/tldraw):
  //  • two-finger swipe (wheel, no ctrl) -> pan in both axes
  //  • pinch (browser sets ctrlKey) or Ctrl+wheel -> zoom toward the cursor
  // deltaY is clamped so a trackpad's tiny deltas and a mouse wheel's huge deltas
  // both feel smooth.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const clamped = Math.max(-10, Math.min(10, e.deltaY));
        const rect = el.getBoundingClientRect();
        anchor.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        const factor = Math.pow(2, -clamped * 0.01);
        setZoom((z) => clampZoom(z * factor));
      } else {
        // Natural panning: content follows the fingers.
        el.scrollLeft -= e.deltaX;
        el.scrollTop -= e.deltaY;
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Click-drag = move inside the drawing (adjusts scroll, so it stays bounded).
  const drag = useRef<{ x: number; y: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const el = scrollRef.current;
    if (!drag.current || !el) return;
    el.scrollLeft -= e.clientX - drag.current.x;
    el.scrollTop -= e.clientY - drag.current.y;
    drag.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = () => (drag.current = null);

  const zoomBtn = (delta: number) => setZoom((z) => clampZoom(z + delta));
  const fit = () => setZoom(1);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-fnc-border bg-fnc-panel px-3 py-1.5 text-xs text-fnc-steel">
        <span className="truncate text-white" title={path}>
          {basename(path)}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <Btn onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
            ‹
          </Btn>
          <span className="px-1">
            {page} / {numPages || "–"}
          </span>
          <Btn onClick={() => setPage((p) => Math.min(numPages, p + 1))} disabled={page >= numPages}>
            ›
          </Btn>
          <span className="mx-2 h-4 w-px bg-fnc-border" />
          <Btn onClick={() => zoomBtn(-0.25)}>−</Btn>
          <span className="w-12 text-center">{Math.round(zoom * 100)}%</span>
          <Btn onClick={() => zoomBtn(0.25)}>+</Btn>
          <Btn onClick={fit}>Fit</Btn>
        </div>
      </div>
      <div
        ref={scrollRef}
        onDoubleClick={fit}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        className="relative flex-1 cursor-grab select-none overflow-auto bg-fnc-bg active:cursor-grabbing"
      >
        {loading && <p className="absolute left-4 top-4 text-sm text-fnc-steel">Loading PDF…</p>}
        {error && <p className="absolute left-4 top-4 text-sm text-red-300">{error}</p>}
        <div className="flex min-h-full min-w-full items-center justify-center p-6">
          <canvas ref={canvasRef} className="rounded bg-white shadow-lg" />
        </div>
      </div>
      <div className="border-t border-fnc-border bg-fnc-panel px-3 py-1 text-[11px] text-fnc-steel/70">
        Two-finger swipe to move · pinch to zoom · click-drag to pan · double-click to fit
      </div>
    </div>
  );
}

function Btn({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded border border-fnc-border px-2 py-0.5 text-white transition hover:bg-fnc-panel-2 disabled:opacity-30"
    >
      {children}
    </button>
  );
}
