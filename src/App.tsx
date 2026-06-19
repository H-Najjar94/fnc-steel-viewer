import { useEffect, useRef } from "react";
import { useStore } from "./store";
import { DEFAULT_PROJECT_ROOT } from "./config";
import Splash from "./components/Splash";
import TopBar from "./components/TopBar";
import Sidebar from "./components/Sidebar";
import Catalog from "./components/Catalog";
import DetailPanel from "./components/DetailPanel";
import ViewerPanel from "./components/ViewerPanel";
import Reports from "./components/Reports";

export default function App() {
  const project = useStore((s) => s.project);
  const mainView = useStore((s) => s.mainView);
  const viewerMaximized = useStore((s) => s.viewerMaximized);
  const openProject = useStore((s) => s.openProject);
  const autoTried = useRef(false);

  // Auto-open the configured default project on first launch. Re-scan fresh
  // (useCache=false) so files added to the folder — new drawings, an IFC — are
  // always picked up.
  useEffect(() => {
    if (autoTried.current) return;
    autoTried.current = true;
    if (DEFAULT_PROJECT_ROOT) openProject(DEFAULT_PROJECT_ROOT, false);
  }, [openProject]);

  if (!project) return <Splash />;

  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        {mainView === "reports" ? (
          <>
            <Sidebar />
            <Reports />
          </>
        ) : viewerMaximized ? (
          <ViewerPanel />
        ) : (
          <>
            <Sidebar />
            <Catalog />
            <ViewerPanel />
            <DetailPanel />
          </>
        )}
      </div>
    </div>
  );
}
