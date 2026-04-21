import { useEffect, useState } from "react";
import {
  Activity,
  ClipboardCheck,
  FolderKanban,
  Pause,
  Play,
  Settings as SettingsIcon,
} from "lucide-react";
import { useTrackingState } from "@renderer/hooks/useTrackingState";
import { formatTime } from "@renderer/lib/format";
import { cn } from "@renderer/lib/utils";
import { Toaster } from "@renderer/components/ui/sonner";
import { TooltipProvider } from "@renderer/components/ui/tooltip";
import { Logo } from "@renderer/components/Logo";
import { ActivitiesView } from "./views/ActivitiesView";
import { ProjectsView } from "./views/ProjectsView";
import { ProjectDetailView } from "./views/ProjectDetailView";
import { ReviewView } from "./views/ReviewView";
import { SettingsView } from "./views/SettingsView";
import { LLMStatusIndicator } from "@renderer/components/LLMStatusIndicator";

type View = "activities" | "projects" | "review" | "settings";

export function App() {
  const state = useTrackingState();
  const [view, setView] = useState<View>("projects");
  const [detailProjectId, setDetailProjectId] = useState<string | null>(null);
  const [updateReady, setUpdateReady] = useState(false);
  const [reviewDate, setReviewDate] = useState<string | undefined>(undefined);

  useEffect(() => {
    return window.electronAPI.onUpdateDownloaded(() => {
      setUpdateReady(true);
    });
  }, []);

  useEffect(() => {
    return window.electronAPI.onFocusReview((date) => {
      setReviewDate(date);
      setView("review");
      setDetailProjectId(null);
    });
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key === "1") { e.preventDefault(); setView("projects"); setDetailProjectId(null); }
      if (e.key === "2") { e.preventDefault(); setView("activities"); setDetailProjectId(null); }
      if (e.key === "3") { e.preventDefault(); setView("review"); setDetailProjectId(null); }
      if (e.key === ",") { e.preventDefault(); setView("settings"); setDetailProjectId(null); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

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
          <div className="drag-region flex items-center px-5 pt-10 pb-4">
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
              icon={<ClipboardCheck className="h-4 w-4" />}
              label="Review"
              active={view === "review"}
              onClick={() => {
                setView("review");
                setDetailProjectId(null);
              }}
            />
          </nav>

          <div className="space-y-1 border-t border-border p-3">
            <LLMStatusIndicator />
            <NavButton
              icon={<SettingsIcon className="h-4 w-4" />}
              label="Settings"
              active={view === "settings"}
              onClick={() => {
                setView("settings");
                setDetailProjectId(null);
              }}
              muted
            />
          </div>

          <div className="border-t border-border p-4">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Today</span>
              <button
                onClick={() => window.electronAPI.togglePause()}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                  state.isPaused
                    ? "bg-amber-500/15 text-amber-400 hover:bg-amber-500/25"
                    : "bg-primary/10 text-primary hover:bg-primary/20",
                )}
              >
                {state.isPaused ? (
                  <>
                    <Play className="h-3 w-3" />
                    Resume
                  </>
                ) : (
                  <>
                    <Pause className="h-3 w-3" />
                    Pause
                  </>
                )}
              </button>
            </div>
            <div className={cn(
              "font-mono text-2xl font-light tabular-nums",
              state.isPaused && "text-muted-foreground",
            )}>
              {formatTime(state.totalTodaySeconds)}
            </div>
            {state.isPaused ? (
              <div className="mt-3 text-xs font-medium text-amber-400">Paused</div>
            ) : state.currentActivity ? (
              <div className="mt-3 truncate text-xs text-muted-foreground">
                {state.currentActivity.app}
              </div>
            ) : null}
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto">
          {updateReady && (
            <div className="flex items-center justify-between border-b border-border bg-primary/10 px-5 py-2">
              <span className="text-sm">Update downloaded — restart to apply</span>
              <button
                onClick={() => window.electronAPI.installUpdate()}
                className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
              >
                Restart
              </button>
            </div>
          )}
          <div key={detailProjectId ? `detail-${detailProjectId}` : view} className="animate-fade-slide-in">
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
            {view === "activities" && (
              <ActivitiesView state={state} onNavigateReview={() => setView("review")} />
            )}
            {view === "review" && <ReviewView state={state} initialDate={reviewDate} />}
            {view === "settings" && <SettingsView />}
          </div>
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
  muted = false,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  muted?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 font-medium transition-colors",
        muted ? "text-xs" : "text-sm",
        active
          ? "bg-accent text-accent-foreground"
          : muted
            ? "text-muted-foreground/80 hover:bg-accent/40 hover:text-foreground"
            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
