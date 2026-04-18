import { Pause, Play } from "lucide-react";
import { Button } from "@renderer/components/ui/button";
import { useTrackingState } from "@renderer/hooks/useTrackingState";
import { formatTime } from "@renderer/lib/format";
import { cn } from "@renderer/lib/utils";

export function Widget() {
  const state = useTrackingState();
  const current = state.currentActivity;
  const currentProject = current?.projectId
    ? state.projects.find((p) => p.id === current.projectId)
    : null;

  return (
    <div className="flex h-screen w-screen flex-col bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-semibold tracking-tight">No Time</div>
        <div
          className={cn(
            "h-2 w-2 rounded-full",
            state.isPaused ? "bg-amber-400" : "animate-pulse bg-primary",
          )}
          aria-hidden
        />
      </div>

      <div className="mb-3 flex items-center gap-2">
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: currentProject?.color ?? "#52525b" }}
          aria-hidden
        />
        <span className="truncate text-sm font-medium">
          {state.isPaused ? "Paused" : (currentProject?.name ?? "Uncategorized")}
        </span>
      </div>

      <div className="mb-3 truncate text-xs text-muted-foreground">
        {state.isPaused
          ? "Tracking paused"
          : current
            ? `${current.app} — ${current.title}`
            : "Waiting for activity…"}
      </div>

      <div className={cn(
        "mb-4 font-mono text-2xl font-light tabular-nums",
        state.isPaused && "text-muted-foreground",
      )}>
        {formatTime(state.totalTodaySeconds)}
      </div>

      <div className="mt-auto flex gap-2">
        <Button
          size="sm"
          variant={state.isPaused ? "default" : "outline"}
          className="flex-1"
          onClick={() => window.electronAPI.togglePause()}
        >
          {state.isPaused ? (
            <><Play className="h-3.5 w-3.5" /> Resume</>
          ) : (
            <><Pause className="h-3.5 w-3.5" /> Pause</>
          )}
        </Button>
        <Button
          className="flex-1"
          size="sm"
          onClick={() => window.electronAPI.openDashboard()}
        >
          Dashboard
        </Button>
      </div>
    </div>
  );
}
