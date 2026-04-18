import { useState } from "react";
import { Activity, FolderKanban, Settings as SettingsIcon } from "lucide-react";
import { useTrackingState } from "@renderer/hooks/useTrackingState";
import { formatTime } from "@renderer/lib/format";
import { cn } from "@renderer/lib/utils";
import { Toaster } from "@renderer/components/ui/sonner";
import { TooltipProvider } from "@renderer/components/ui/tooltip";
import { Logo } from "@renderer/components/Logo";
import { ActivitiesView } from "./views/ActivitiesView";
import { ProjectsView } from "./views/ProjectsView";
import { ProjectDetailView } from "./views/ProjectDetailView";
import { SettingsView } from "./views/SettingsView";

type View = "activities" | "projects" | "settings";

export function App() {
  const state = useTrackingState();
  const [view, setView] = useState<View>("projects");
  const [detailProjectId, setDetailProjectId] = useState<string | null>(null);

  const openProjectDetail = (id: string) => {
    setDetailProjectId(id);
  };

  const backToProjects = () => setDetailProjectId(null);

  const detailProject = detailProjectId
    ? state.projects.find((p) => p.id === detailProjectId) ?? null
    : null;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
        <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-card/50">
          <div className="flex items-center px-5 pt-10 pb-4">
            <Logo className="h-5 w-auto text-foreground" />
          </div>

          <nav className="flex-1 space-y-1 p-3">
            <NavButton
              icon={<FolderKanban className="h-4 w-4" />}
              label="Projects"
              active={view === "projects" && !detailProjectId}
              onClick={() => {
                setView("projects");
                setDetailProjectId(null);
              }}
            />
            <NavButton
              icon={<Activity className="h-4 w-4" />}
              label="Activities"
              active={view === "activities"}
              onClick={() => {
                setView("activities");
                setDetailProjectId(null);
              }}
            />
            <NavButton
              icon={<SettingsIcon className="h-4 w-4" />}
              label="Settings"
              active={view === "settings"}
              onClick={() => {
                setView("settings");
                setDetailProjectId(null);
              }}
            />
          </nav>

          <div className="border-t border-border p-4">
            <div className="mb-1 text-xs text-muted-foreground">Today</div>
            <div className="font-mono text-2xl font-light tabular-nums">
              {formatTime(state.totalTodaySeconds)}
            </div>
            {state.currentActivity && (
              <div className="mt-3 truncate text-xs text-muted-foreground">
                {state.currentActivity.app}
              </div>
            )}
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto">
          {view === "projects" && !detailProject && (
            <ProjectsView state={state} onOpenProject={openProjectDetail} />
          )}
          {view === "projects" && detailProject && (
            <ProjectDetailView
              state={state}
              project={detailProject}
              onBack={backToProjects}
            />
          )}
          {view === "activities" && <ActivitiesView state={state} />}
          {view === "settings" && <SettingsView />}
        </main>
      </div>

      <Toaster position="bottom-right" />
    </TooltipProvider>
  );
}

function NavButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
