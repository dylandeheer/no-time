import { Button } from "@renderer/components/ui/button";
import { useTrackingState } from "@renderer/hooks/useTrackingState";
import { formatTime } from "@renderer/lib/format";

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
        <div className="h-2 w-2 animate-pulse rounded-full bg-primary" aria-hidden />
      </div>

      <div className="mb-3 flex items-center gap-2">
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: currentProject?.color ?? "#52525b" }}
          aria-hidden
        />
        <span className="truncate text-sm font-medium">
          {currentProject?.name ?? "Uncategorized"}
        </span>
      </div>

      <div className="mb-3 truncate text-xs text-muted-foreground">
        {current ? `${current.app} — ${current.title}` : "Waiting for activity…"}
      </div>

      <div className="mb-4 font-mono text-2xl font-light tabular-nums">
        {formatTime(state.totalTodaySeconds)}
      </div>

      <Button
        className="mt-auto"
        size="sm"
        onClick={() => window.electronAPI.openDashboard()}
      >
        Open dashboard
      </Button>
    </div>
  );
}
